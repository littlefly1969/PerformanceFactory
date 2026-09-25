import { BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { athleteDate, dateOnly } from '../athlete/training-sessions';
import { hashJson } from './proposal-audit';
import { buildModelContext, buildSystemPrompt } from './proposal-prompts';
import { prepareCycleProposalInput } from './cycle-generation';
import { AreaRecord } from './orchestrator-model';
import {
  AreaScheduleInput,
  AreaSessionProposal,
  AreaWindow,
  AREA_SCHEDULE_PROMPT_VERSION,
  AiProvider,
  CycleProposal,
  ScheduleConstraints,
} from './proposal-provider-model';
import {
  areaDayOffsets,
  buildAreaScheduleJsonSchema,
  cycleQuestionLayout,
} from './proposal-schemas';
import { requestStructuredProposal } from './proposal-structured-transport';
import { AiProposalProviderService } from './proposal-provider.service';
import { resolveModel, resolveProvider } from './provider-config';
import {
  prescriptionRange,
  trainingAvailability,
} from './training-constraints';
import { validateTrainingSchedule } from './training-schedule';

/** Tetto di prodotto per la traccia area: resta sotto al programma sportivo. */
export const AREA_FREQUENCY = { min: 1, max: 2 };
/** Durata massima di una seduta di area nel giorno di una sessione sportiva. */
export const AREA_SHARED_DAY_MINUTES = 20;

export function areaWindowFromTraining(release: {
  startsOn: Date | null;
  endsOn: Date | null;
  windowDays: number;
}): AreaWindow {
  if (!release.startsOn || !release.endsOn)
    throw new ConflictException({
      code: 'AREA_WINDOW_UNAVAILABLE',
      message: 'La finestra sportiva non ha date',
    });
  return {
    startsOn: release.startsOn.toISOString().slice(0, 10),
    endsOn: release.endsOn.toISOString().slice(0, 10),
    windowDays: release.windowDays,
  };
}

/**
 * Giorni della finestra utilizzabili dall'area: liberi da sessioni sportive,
 * compatibili con i giorni preferiti e non gia passati.
 */
export function freeDayOffsets(
  window: AreaWindow,
  occupied: Date[],
  availability: ScheduleConstraints['availability'],
  now = new Date(),
) {
  const start = dateOnly(window.startsOn);
  const today = dateOnly(athleteDate(now));
  const taken = new Set(
    occupied.map((date) => date.toISOString().slice(0, 10)),
  );
  const offsets: number[] = [];
  for (let offset = 0; offset < window.windowDays; offset += 1) {
    const date = new Date(start.getTime() + offset * 86400000);
    if (date < today) continue;
    if (taken.has(date.toISOString().slice(0, 10))) continue;
    const weekday = date.getUTCDay() || 7;
    if (
      availability.preferredDays?.length &&
      !availability.preferredDays.includes(weekday)
    )
      continue;
    offsets.push(offset);
  }
  return offsets;
}

/**
 * Giorni dell'area settimana per settimana. Valgono i giorni liberi entro i giorni
 * dichiarati dall'atleta; una settimana che non ne ha affianca sedute brevi alle
 * sessioni sportive, cosi l'area non aggiunge giorni di impegno.
 */
export function areaScheduleDays(
  window: AreaWindow,
  sportDates: Date[],
  availability: ScheduleConstraints['availability'],
  now = new Date(),
) {
  const free = freeDayOffsets(window, sportDates, availability, now);
  // Giorni futuri e preferiti, a prescindere dallo sport.
  const open = new Set(freeDayOffsets(window, [], availability, now));
  const start = dateOnly(window.startsOn).getTime();
  const sport = sportDates
    .map((date) => Math.round((date.getTime() - start) / 86400000))
    .sort((a, b) => a - b);
  const days = {
    freeDayOffsets: [] as number[],
    sharedDayOffsets: [] as number[],
    capacity: [] as number[],
  };
  for (let week = 0; week < Math.ceil(window.windowDays / 7); week += 1) {
    const inWeek = (offset: number) =>
      offset >= week * 7 && offset < (week + 1) * 7;
    const weekSport = sport.filter(inWeek);
    const weekFree = free.filter(inWeek);
    const freeCapacity = Math.min(
      weekFree.length,
      availability.daysPerWeek - weekSport.length,
    );
    if (freeCapacity > 0) {
      days.freeDayOffsets.push(...weekFree);
      days.capacity.push(freeCapacity);
    } else {
      const shared = weekSport.filter((offset) => open.has(offset));
      days.sharedDayOffsets.push(...shared);
      days.capacity.push(Math.min(shared.length, availability.daysPerWeek));
    }
  }
  return days;
}

/**
 * Frequenza dell'area dalla capienza di ogni settimana relativa. Se una settimana
 * non ha capienza la finestra non viene pianificata.
 */
export function areaPrescription(
  capacity: number[],
  previous?: {
    planned: number;
    completed: number;
    ratings: number[];
    checkInScores: number[];
  },
) {
  if (capacity.some((count) => count <= 0))
    throw new ConflictException({
      code: 'AREA_SCHEDULE_NO_FREE_DAYS',
      message: 'Nessun giorno disponibile per l area in questa finestra',
    });
  return prescriptionRange(AREA_FREQUENCY, Math.min(...capacity), previous);
}

export function validateAreaSchedule(
  proposal: { sessionsPerWeek: number; planItems: AreaSessionProposal[] },
  constraints: ScheduleConstraints,
  startsOn: string,
  offsets: number[],
  shared: number[] = [],
) {
  validateTrainingSchedule(proposal, constraints, startsOn);
  const free = new Set(offsets);
  const sharedDays = new Set(shared);
  for (const session of proposal.planItems) {
    if (sharedDays.has(session.dayOffset)) {
      if (session.durationMinutes > AREA_SHARED_DAY_MINUTES)
        throw new BadRequestException({
          code: 'INVALID_AI_OUTPUT',
          message:
            'Calendario AI non valido: seduta troppo lunga nel giorno sportivo',
        });
    } else if (!free.has(session.dayOffset))
      throw new BadRequestException({
        code: 'INVALID_AI_OUTPUT',
        message: 'Calendario AI non valido: giorno gia occupato dallo sport',
      });
  }
}

export function buildAreaSchedulePreview(input: AreaScheduleInput) {
  const shared = input.sharedDayOffsets;
  const prompt = {
    system: `${buildSystemPrompt(input)}\nCONTRATTO AREA A CALENDARIO: pianifica sedute della sola area ${input.area.name} nei giorni ammessi indicati della finestra operativa. Non sostituisci il programma sportivo: lo affianchi. I vincoli numerici e i giorni ammessi prevalgono su indicazioni generiche di produrre da una a tre attivita. Massimo una seduta al giorno. Non inventare disponibilita o giorni.`,
    user: {
      task: `Programma sedute di ${input.area.name} eseguibili nei giorni ammessi della finestra e ${cycleQuestionLayout(input).questions} domande di monitoraggio.`,
      constraints: input.scheduleConstraints,
      window: input.areaWindow,
      freeDayOffsets: input.freeDayOffsets,
      sharedDayOffsets: shared,
      context: buildModelContext(input.context),
      rules: [
        `dayOffset ammessi esclusivamente: ${areaDayOffsets(input).join(', ')}.`,
        'Ogni settimana relativa alla finestra (offset 0..6, 7..13) deve rispettare min/max sedute.',
        shared.length
          ? `Dei giorni occupati dal programma sportivo sono ammessi solo i dayOffset ${shared.join(', ')}: li proponi una seduta breve di attivazione o prevenzione da abbinare alla seduta sportiva, al massimo ${AREA_SHARED_DAY_MINUTES} minuti.`
          : 'I giorni occupati dal programma sportivo non sono disponibili: non proporli.',
        'Non superare la disponibilita di durata; considera skip, note, rating e check-in precedenti.',
        'Il lavoro di area integra il programma sportivo, senza duplicarne il contenuto.',
      ],
    },
    responseJsonSchema: buildAreaScheduleJsonSchema(input),
  };
  const inputJson = {
    area: { name: input.area.name },
    nextVersion: input.nextVersion,
    reason: input.reason,
    prompt,
  };
  const provider = resolveProvider();
  return {
    provider,
    model: resolveModel(provider),
    promptVersion: AREA_SCHEDULE_PROMPT_VERSION,
    promptHash: hashJson(inputJson),
    inputJson,
  };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException({
      code: 'INVALID_AI_OUTPUT',
      message: 'Output area non valido',
    });
  return value as Record<string, unknown>;
}

/**
 * La proposta viene normalizzata come CycleProposal: la schedulazione viaggia nei
 * metadata dell'attivita, cosi persistenza, approvazione e pubblicazione AREA
 * restano quelle esistenti.
 */
export function normalizeAreaScheduleProposal(
  input: AreaScheduleInput,
  parsed: unknown,
  provider: AiProvider,
  model: string,
  inputJson: Record<string, unknown>,
  startedAt: number,
  usage: {
    inputTokens?: number | null;
    outputTokens?: number | null;
    totalTokens?: number | null;
  } = {},
): CycleProposal {
  const raw = object(parsed);
  const fail = (): never => {
    throw new BadRequestException({
      code: 'INVALID_AI_OUTPUT',
      message: 'Output area incompleto',
    });
  };
  if (
    typeof raw.summaryText !== 'string' ||
    !raw.summaryText.trim() ||
    !Array.isArray(raw.planItems) ||
    !Array.isArray(raw.questions)
  )
    fail();
  const sessions = (raw.planItems as unknown[]).map((value) => {
    const item = object(value);
    return {
      type: item.type,
      title: item.title,
      body: item.body,
      dayOffset: item.dayOffset,
      durationMinutes: item.durationMinutes,
      equipment: item.equipment ?? null,
      sets: item.sets ?? null,
      reps: item.reps ?? null,
      restSeconds: item.restSeconds ?? null,
    } as AreaSessionProposal;
  });
  const sessionsPerWeek = raw.sessionsPerWeek as number;
  validateAreaSchedule(
    { sessionsPerWeek, planItems: sessions },
    input.scheduleConstraints,
    input.areaWindow.startsOn,
    input.freeDayOffsets,
    input.sharedDayOffsets,
  );
  const layout = cycleQuestionLayout(input);
  if ((raw.questions as unknown[]).length !== layout.questions) fail();
  const planItems = [...sessions]
    .sort((a, b) => a.dayOffset - b.dayOffset)
    .map((session) => ({
      type: session.type,
      title: session.title,
      body: session.body,
      metadata: {
        source: 'area-schedule',
        area: input.area.name,
        provider,
        model,
        promptVersion: AREA_SCHEDULE_PROMPT_VERSION,
        schedule: {
          dayOffset: session.dayOffset,
          durationMinutes: session.durationMinutes,
        },
        durationMinutes: session.durationMinutes,
        ...(session.equipment ? { equipment: session.equipment } : {}),
        ...(session.sets === null ? {} : { sets: session.sets }),
        ...(session.reps ? { reps: session.reps } : {}),
        ...(session.restSeconds === null
          ? {}
          : { restSeconds: session.restSeconds }),
      } as Record<string, unknown>,
    }));
  const questions = (raw.questions as unknown[]).map((value, index) => {
    const q = object(value);
    if (typeof q.text !== 'string' || !q.text.trim()) fail();
    return {
      text: q.text as string,
      objectiveRef:
        typeof q.objectiveRef === 'string'
          ? q.objectiveRef
          : `area:${input.area.id}`,
      orderIndex: index + 1,
      options: layout.answerOptions,
    };
  });
  const output = {
    provider,
    model,
    promptVersion: AREA_SCHEDULE_PROMPT_VERSION,
    promptHash: hashJson(inputJson),
    summaryText: raw.summaryText as string,
    planItems,
    questions,
  };
  return {
    ...output,
    audit: {
      status: 'SUCCESS',
      inputJson,
      outputJson: { ...output, sessionsPerWeek },
      latencyMs: Date.now() - startedAt,
      correlationId: randomUUID(),
      ...usage,
    },
  };
}

export async function generateAreaScheduleProposal(
  logger: Logger,
  input: AreaScheduleInput,
): Promise<CycleProposal> {
  const startedAt = Date.now();
  const preview = buildAreaSchedulePreview(input);
  const { provider, model, inputJson } = preview;
  const { prescription, availability } = input.scheduleConstraints;
  if (provider === 'stub') {
    const weeks = Math.ceil(input.areaWindow.windowDays / 7);
    const count = Math.max(prescription.minSessionsPerWeek, 1);
    const shared = new Set(input.sharedDayOffsets);
    const planItems = Array.from({ length: weeks }, (_, week) =>
      areaDayOffsets(input)
        .filter((o) => o >= week * 7 && o < (week + 1) * 7)
        .slice(0, Math.min(count, prescription.maxSessionsPerWeek)),
    ).flatMap((offsets, week) =>
      offsets.map((dayOffset, index) => ({
        type: 'AREA_SESSION',
        title: `${input.area.name} ${week + 1}.${index + 1}`,
        body: shared.has(dayOffset)
          ? 'Attivazione e prevenzione da abbinare alla seduta sportiva.'
          : 'Attivazione, lavoro specifico di area e defaticamento.',
        dayOffset,
        durationMinutes: Math.min(
          shared.has(dayOffset) ? AREA_SHARED_DAY_MINUTES : 45,
          availability.sessionDurationMinutes,
        ),
      })),
    );
    return normalizeAreaScheduleProposal(
      input,
      {
        summaryText: `Sedute di ${input.area.name} nella finestra sportiva`,
        sessionsPerWeek: Math.max(
          ...Array.from(
            { length: weeks },
            (_, week) =>
              planItems.filter(
                (i) => i.dayOffset >= week * 7 && i.dayOffset < (week + 1) * 7,
              ).length,
          ),
        ),
        planItems,
        questions: Array.from(
          { length: cycleQuestionLayout(input).questions },
          (_, i) => ({ text: `${input.area.name}: verifica ${i + 1}` }),
        ),
      },
      provider,
      model,
      inputJson,
      startedAt,
    );
  }
  const result = await requestStructuredProposal(
    logger,
    provider,
    model,
    inputJson,
    {
      system: inputJson.prompt.system,
      user: inputJson.prompt.user,
      schema: buildAreaScheduleJsonSchema(input, {
        includePropertyOrdering: provider === 'gemini',
      }),
    },
    'area_schedule_proposal',
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.outputText);
  } catch {
    throw new BadRequestException({
      code: 'INVALID_AI_OUTPUT',
      message: 'Output area non JSON',
    });
  }
  return normalizeAreaScheduleProposal(
    input,
    parsed,
    provider,
    model,
    inputJson,
    startedAt,
    result.usage,
  );
}

/** Aderenza della finestra precedente della stessa area, se era schedulata. */
async function previousAreaWork(
  prisma: PrismaService,
  userId: string,
  areaId: string,
) {
  const previous = await prisma.improvementPlanRelease.findFirst({
    where: { userId, areaId, startsOn: { not: null } },
    orderBy: { version: 'desc' },
    include: {
      sessions: true,
      questionSets: {
        include: { questions: { include: { answers: true } } },
      },
    },
  });
  if (!previous?.sessions.length) return undefined;
  return {
    planned: previous.sessions.length,
    completed: previous.sessions.filter((s) => s.status === 'COMPLETED').length,
    ratings: previous.sessions.flatMap((s) =>
      s.completionRating === null ? [] : [s.completionRating],
    ),
    checkInScores: previous.questionSets.flatMap((qs) =>
      qs.questions.flatMap((q) => q.answers.map((a) => a.scoreAwarded)),
    ),
  };
}

export async function prepareAreaScheduleInput(
  prisma: PrismaService,
  provider: AiProposalProviderService,
  userId: string,
  area: AreaRecord,
  trainingReleaseId: string,
  reason: string,
): Promise<AreaScheduleInput> {
  const training = await prisma.trainingPlanRelease.findFirst({
    where: { id: trainingReleaseId, userId },
    select: {
      startsOn: true,
      endsOn: true,
      windowDays: true,
      status: true,
      sessions: { select: { scheduledDate: true } },
    },
  });
  if (!training || training.status !== 'ACTIVE')
    throw new ConflictException({
      code: 'AREA_WINDOW_UNAVAILABLE',
      message: 'La finestra sportiva non e attiva',
    });
  const areaWindow = areaWindowFromTraining(training);
  const assessment = await prisma.userOnboardingAssessment.findUnique({
    where: { userId },
    select: { profileJson: true },
  });
  const { availability } = trainingAvailability(assessment?.profileJson);
  const days = areaScheduleDays(
    areaWindow,
    training.sessions.map((s) => s.scheduledDate),
    availability,
  );
  const prescription = areaPrescription(
    days.capacity,
    await previousAreaWork(prisma, userId, area.id),
  );
  const base = await prepareCycleProposalInput(
    prisma,
    provider,
    userId,
    area,
    reason,
    true,
  );
  return {
    ...base,
    areaWindow,
    freeDayOffsets: days.freeDayOffsets,
    sharedDayOffsets: days.sharedDayOffsets,
    scheduleConstraints: {
      operationalWindowDays: areaWindow.windowDays,
      currentFrequency: AREA_FREQUENCY,
      availability,
      prescription,
    },
  };
}
