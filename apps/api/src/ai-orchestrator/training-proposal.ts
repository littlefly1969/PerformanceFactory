import { BadRequestException, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { hashJson } from './proposal-audit';
import { buildModelContext, buildSystemPrompt } from './proposal-prompts';
import {
  TrainingProposalInput,
  TrainingCycleProposal,
  TrainingSessionProposal,
  TRAINING_PROMPT_VERSION,
  AiProvider,
} from './proposal-provider-model';
import {
  buildTrainingProposalJsonSchema,
  cycleQuestionLayout,
} from './proposal-schemas';
import { resolveProvider, resolveModel } from './provider-config';
import { requestStructuredProposal } from './proposal-structured-transport';
import { validateTrainingSchedule } from './training-schedule';

export function buildTrainingProposalPreview(input: TrainingProposalInput) {
  const provider = resolveProvider();
  const prompt = {
    system: `${buildSystemPrompt(input)}\nCONTRATTO TRAINING: pianifica esclusivamente la finestra operativa di 14 giorni indicata. L'orizzonte strategico resta il programma di 4, 12 o 52 settimane. I vincoli numerici e il calendario di questo contratto prevalgono su eventuali indicazioni generiche di produrre da uno a tre esercizi. Massimo una sessione al giorno. Non inventare disponibilità o metriche.`,
    user: {
      task: `Programma allenamenti eseguibili nei prossimi 14 giorni e ${cycleQuestionLayout(input).questions} domande di monitoraggio. Frequenza e distribuzione devono rispettare i vincoli PF.`,
      constraints: input.trainingConstraints,
      window: input.trainingWindow,
      context: buildModelContext(input.context),
      rules: [
        'dayOffset intero 0..13; nessuna data fuori finestra.',
        'Ogni settimana relativa alla finestra (offset 0..6, 7..13) deve rispettare min/max sessioni.',
        'Le due settimane possono avere frequenze diverse: sessionsPerWeek è il maggiore dei due conteggi. Il massimo settimanale vale anche per ogni intervallo di sette giorni consecutivi.',
        'Non superare la disponibilità di durata; considera skip, note, rating e check-in precedenti.',
        'Il nuovo macroblocco continua il percorso, senza azzerare lo storico.',
      ],
    },
    responseJsonSchema: buildTrainingProposalJsonSchema(input),
  };
  const inputJson = {
    area: { name: input.area.name },
    nextVersion: input.nextVersion,
    reason: input.reason,
    prompt,
  };
  return {
    provider,
    model: resolveModel(provider),
    promptVersion: TRAINING_PROMPT_VERSION,
    promptHash: hashJson(inputJson),
    inputJson,
  };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException({
      code: 'INVALID_AI_OUTPUT',
      message: 'Output training non valido',
    });
  return value as Record<string, unknown>;
}
export function normalizeTrainingProposal(
  input: TrainingProposalInput,
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
): TrainingCycleProposal {
  const raw = object(parsed);
  const fail = (): never => {
    throw new BadRequestException({
      code: 'INVALID_AI_OUTPUT',
      message: 'Output training incompleto',
    });
  };
  if (
    typeof raw.summaryText !== 'string' ||
    !raw.summaryText.trim() ||
    !Array.isArray(raw.planItems) ||
    !Array.isArray(raw.questions)
  )
    fail();
  const planItems = (raw.planItems as unknown[]).map((value) => {
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
    } as TrainingSessionProposal;
  });
  const sessionsPerWeek = raw.sessionsPerWeek as number;
  validateTrainingSchedule(
    { sessionsPerWeek, planItems },
    input.trainingConstraints,
    input.trainingWindow.startsOn,
  );
  const layout = cycleQuestionLayout(input);
  if ((raw.questions as unknown[]).length !== layout.questions) fail();
  const questions = (raw.questions as unknown[]).map((value, index) => {
    const q = object(value);
    if (typeof q.text !== 'string' || !q.text.trim()) fail();
    return {
      text: q.text as string,
      objectiveRef:
        typeof q.objectiveRef === 'string' ? q.objectiveRef : 'training',
      orderIndex: index + 1,
      options: layout.answerOptions,
    };
  });
  const output = {
    provider,
    model,
    promptVersion: TRAINING_PROMPT_VERSION,
    promptHash: hashJson(inputJson),
    summaryText: raw.summaryText as string,
    sessionsPerWeek,
    planItems,
    questions,
    trainingConstraints: input.trainingConstraints,
    trainingWindow: input.trainingWindow,
  };
  return {
    ...output,
    audit: {
      status: 'SUCCESS',
      inputJson,
      outputJson: output,
      latencyMs: Date.now() - startedAt,
      correlationId: randomUUID(),
      ...usage,
    },
  };
}
export async function generateTrainingProposal(
  logger: Logger,
  input: TrainingProposalInput,
): Promise<TrainingCycleProposal> {
  const startedAt = Date.now();
  const preview = buildTrainingProposalPreview(input);
  const { provider, model, inputJson } = preview;
  if (provider === 'stub') {
    const { prescription, availability } = input.trainingConstraints;
    const count = Math.min(
      prescription.maxSessionsPerWeek,
      Math.max(prescription.minSessionsPerWeek, 3),
    );
    const start = new Date(`${input.trainingWindow.startsOn}T00:00:00Z`);
    const days = Array.from({ length: 7 }, (_, i) => i).filter(
      (i) =>
        !availability.preferredDays?.length ||
        availability.preferredDays.includes(
          new Date(start.getTime() + i * 86400000).getUTCDay() || 7,
        ),
    );
    const planItems = [0, 7].flatMap((week) =>
      Array.from({ length: count }, (_, i) => ({
        type: 'TRAINING',
        title: `Allenamento ${week ? 2 : 1}.${i + 1}`,
        body: 'Riscaldamento, lavoro tecnico controllato e recupero.',
        dayOffset: week + days[Math.floor((i * days.length) / count)],
        durationMinutes: Math.min(45, availability.sessionDurationMinutes),
      })),
    );
    return normalizeTrainingProposal(
      input,
      {
        summaryText: 'Finestra adattiva di 14 giorni',
        sessionsPerWeek: count,
        planItems,
        questions: Array.from(
          { length: cycleQuestionLayout(input).questions },
          (_, i) => ({ text: `Verifica allenamento ${i + 1}` }),
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
      schema: buildTrainingProposalJsonSchema(input, {
        includePropertyOrdering: provider === 'gemini',
      }),
    },
    'training_cycle_proposal',
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.outputText);
  } catch {
    throw new BadRequestException({
      code: 'INVALID_AI_OUTPUT',
      message: 'Output training non JSON',
    });
  }
  return normalizeTrainingProposal(
    input,
    parsed,
    provider,
    model,
    inputJson,
    startedAt,
    result.usage,
  );
}
