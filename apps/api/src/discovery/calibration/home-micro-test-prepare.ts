import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { CalibrationQuestion } from '../../ai-orchestrator/calibration-questions';
import { AiProposalProviderService } from '../../ai-orchestrator/proposal-provider.service';
import { AssessmentEvaluationInput } from '../../ai-orchestrator/assessment-evaluation-model';
import {
  MicroTestFilter,
  filterOf,
} from '../../ai-orchestrator/micro-test-practical';
import { AnalyticsService } from '../../analytics/analytics.service';
import { PrismaService } from '../../prisma/prisma.service';
import { requireAiConsent } from '../assessment-evaluation';
import { lockOpenCalibration } from './calibration-closing';
import { loadCalibrationSettings } from './calibration-config';
import { isCalibrationClosed } from './calibration-rules';
import {
  generateTailoredMicroTest,
  microTestQuestions,
} from './micro-test-step';

/** Round che non sono il micro-test della home (anche quelli senza azione). */
export const NOT_MICRO_TEST = {
  OR: [{ action: null }, { action: { not: 'PROPOSE_MICRO_TEST' } }],
} satisfies Prisma.CalibrationRoundWhereInput;

/** Quante aree meno sviluppate passano all'AI per il micro-test della home. */
const HOME_MICRO_TEST_AREAS = 3;

/** Attesa massima del lease per salvare il micro-test preparato. */
const SAVE_WAIT_MS = 30 * 1000;

/**
 * Una preparazione ferma da più di così (processo caduto a metà) libera il
 * suo posto: la riprende la richiesta successiva. Supera i tentativi dell'AI.
 */
export const SLOT_STALE_MS = 5 * 60 * 1000;

const REASON: Record<MicroTestFilter, string> = {
  THEORY:
    "Micro-test teorico della home: verifica con situazioni di gioco un'area poco sviluppata.",
  ON_COURT:
    "Micro-test pratico della home, sul campo: verifica con una prova un'area poco sviluppata.",
  OFF_COURT:
    "Micro-test pratico della home, fuori dal campo: verifica con una prova un'area poco sviluppata.",
};

type Db = PrismaService | Prisma.TransactionClient;
type Round = Prisma.CalibrationRoundGetPayload<object>;

/** Giorno di calendario in Italia (AAAA-MM-GG): limite e serie seguono i giorni dell'atleta. */
export const romeDay = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

/** Ciò che serve dal servizio di calibrazione per preparare il micro-test. */
export type PrepareDeps = {
  prisma: PrismaService;
  ai: AiProposalProviderService;
  analytics: AnalyticsService;
  expireIfDue: (
    userId: string,
    now: Date,
  ) => Promise<{ status: string } | null>;
  evaluationInput: (
    userId: string,
    rounds: Round[],
  ) => Promise<AssessmentEvaluationInput>;
  claim: (userId: string) => Promise<Date | null>;
  release: (userId: string, lease: Date) => Promise<void>;
};

/**
 * Filtro di un round del micro-test: quello del posto del giorno, o per i
 * test nati prima dei filtri quello che corrisponde alla sua forma.
 */
export function roundFilter(round: {
  questionsJson: unknown;
  microTestSlot?: { filter: string } | null;
}): MicroTestFilter {
  if (round.microTestSlot) return round.microTestSlot.filter as MicroTestFilter;
  const test = (round.questionsJson as CalibrationQuestion[])[0]?.microTest;
  return filterOf({
    format: test?.situation ? 'SITUATIONAL' : 'PRACTICAL',
    setting: test?.setting ?? null,
  });
}

/** I micro-test della home aperti o in valutazione, con il loro filtro. */
export async function openHomeMicroTests(db: Db, userId: string) {
  const rounds = await db.calibrationRound.findMany({
    where: {
      userId,
      action: 'PROPOSE_MICRO_TEST',
      status: { in: ['OPEN', 'EVALUATING'] },
    },
    orderBy: { sequence: 'desc' },
    include: { microTestSlot: { select: { filter: true } } },
  });
  return rounds.map((round) => ({ ...round, filter: roundFilter(round) }));
}

/** Il micro-test aperto del filtro, se c'è (il più recente). */
export async function openHomeMicroTest(
  db: Db,
  userId: string,
  filter: MicroTestFilter,
) {
  return (
    (await openHomeMicroTests(db, userId)).find((r) => r.filter === filter) ??
    null
  );
}

/**
 * Le aree meno sviluppate (score più basso, poi confidenza più bassa), senza
 * quella dell'ultimo micro-test quando ce ne sono altre.
 */
export function weakestAreas(
  areas: { areaId: string; score: number; confidence: number }[],
  lastArea?: string,
) {
  const sorted = [...areas].sort(
    (a, b) => a.score - b.score || a.confidence - b.confidence,
  );
  const others = sorted.filter((a) => a.areaId !== lastArea);
  return (others.length ? others : sorted)
    .slice(0, HOME_MICRO_TEST_AREAS)
    .map((a) => a.areaId);
}

/** Primo numero di posto libero da 1 al limite; null se il giorno è pieno. */
export function freeSlot(used: number[], limit: number) {
  for (let slot = 1; slot <= limit; slot++)
    if (!used.includes(slot)) return slot;
  return null;
}

/** Posti del filtro presi oggi e limite del back office. */
export async function dailyUsage(
  db: Db,
  userId: string,
  filter: MicroTestFilter,
  now: Date,
) {
  const [used, settings] = await Promise.all([
    db.microTestSlot.count({ where: { userId, filter, day: romeDay(now) } }),
    loadCalibrationSettings(db),
  ]);
  return { used, limit: settings.microTestsPerDay };
}

type Reservation =
  | { kind: 'CLOSED' | 'OPEN' | 'PREPARING' | 'LIMIT' }
  | { kind: 'RESERVED'; slotId: string; token: string };

/**
 * Prende un posto del giorno per il filtro, prima di chiamare l'AI. Sotto il
 * lock della calibrazione: un solo test aperto o in preparazione per filtro, e
 * al massimo `microTestsPerDay` posti per filtro e giorno italiano. Il vincolo
 * unico (atleta, giorno, filtro, posto) regge il limite anche se il lock
 * mancasse. Una preparazione ferma oltre SLOT_STALE_MS libera il posto.
 */
export async function reserveSlot(
  prisma: PrismaService,
  userId: string,
  filter: MicroTestFilter,
  now: Date,
): Promise<Reservation> {
  try {
    return await prisma.$transaction(async (tx): Promise<Reservation> => {
      if (!(await lockOpenCalibration(tx, userId, now)))
        return { kind: 'CLOSED' };
      if (await openHomeMicroTest(tx, userId, filter)) return { kind: 'OPEN' };
      await tx.microTestSlot.deleteMany({
        where: {
          userId,
          filter,
          status: 'PREPARING',
          claimedAt: { lt: new Date(now.getTime() - SLOT_STALE_MS) },
        },
      });
      const preparing = await tx.microTestSlot.count({
        where: { userId, filter, status: 'PREPARING' },
      });
      if (preparing) return { kind: 'PREPARING' };
      const day = romeDay(now);
      const [taken, settings] = await Promise.all([
        tx.microTestSlot.findMany({
          where: { userId, filter, day },
          select: { slot: true },
        }),
        loadCalibrationSettings(tx),
      ]);
      const slot = freeSlot(
        taken.map((t) => t.slot),
        settings.microTestsPerDay,
      );
      if (slot === null) return { kind: 'LIMIT' };
      const token = randomUUID();
      const created = await tx.microTestSlot.create({
        data: { userId, day, filter, slot, token, claimedAt: now },
        select: { id: true },
      });
      return { kind: 'RESERVED', slotId: created.id, token };
    });
  } catch (error) {
    // Un'altra richiesta ha preso lo stesso posto: la sua preparazione vale.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    )
      return { kind: 'PREPARING' };
    throw error;
  }
}

/** Il lease per un salvataggio breve: si aspetta che l'operazione in corso finisca. */
async function waitClaim(deps: PrepareDeps, userId: string) {
  const until = Date.now() + SAVE_WAIT_MS;
  for (;;) {
    const lease = await deps.claim(userId);
    if (lease) return lease;
    if (Date.now() > until)
      throw new ConflictException(
        'Elaborazione già in corso. Attendi e riprendi il percorso.',
      );
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

/**
 * Micro-test della home per il filtro scelto (Teorici, Pratici sul campo o
 * fuori dal campo), fuori dal ciclo di calibrazione. Se il filtro non ha un
 * test aperto e ha ancora posti oggi, l'AI ne prepara uno sulle aree meno
 * sviluppate, senza ripetere l'area dell'ultimo dello stesso filtro.
 *
 * Il posto si prende prima dell'AI (vedi reserveSlot): richieste concorrenti,
 * anche da processi diversi, non preparano due test né superano il limite.
 * L'AI lavora senza lease; solo il salvataggio lo prende, così le domande di
 * calibrazione non aspettano, e salva solo chi possiede ancora il posto. Se
 * l'AI fallisce il posto si libera e non conta nel limite.
 * Restituisce false se la fase gratuita è chiusa.
 */
export async function prepareHomeMicroTest(
  deps: PrepareDeps,
  userId: string,
  filter: MicroTestFilter,
  now: Date,
) {
  const { prisma } = deps;
  const calibration = await deps.expireIfDue(userId, now);
  if (!calibration || isCalibrationClosed(calibration.status)) return false;
  await requireAiConsent(prisma, userId);
  const reservation = await reserveSlot(prisma, userId, filter, now);
  if (reservation.kind === 'CLOSED') return false;
  if (reservation.kind !== 'RESERVED') return true;
  const mine = { id: reservation.slotId, token: reservation.token };
  let saved = false;
  try {
    const [rounds, latest] = await Promise.all([
      prisma.calibrationRound.findMany({
        where: { userId },
        orderBy: { sequence: 'asc' },
        include: { microTestSlot: { select: { filter: true } } },
      }),
      prisma.assessmentEvaluation.findFirstOrThrow({
        where: { userId },
        orderBy: { sequence: 'desc' },
        select: { areas: true },
      }),
    ]);
    const lastArea = rounds
      .filter(
        (r) => r.action === 'PROPOSE_MICRO_TEST' && roundFilter(r) === filter,
      )
      .at(-1)?.targetAreas[0];
    const input = await deps.evaluationInput(
      userId,
      rounds.filter((r) => r.status === 'EVALUATED'),
    );
    const test = await generateTailoredMicroTest(
      prisma,
      deps.ai,
      userId,
      input,
      {
        areaIds: weakestAreas(latest.areas, lastArea),
        reason: REASON[filter],
        filter,
      },
    );
    const lease = await waitClaim(deps, userId);
    try {
      saved = await prisma.$transaction(async (tx) => {
        if (!(await lockOpenCalibration(tx, userId, new Date()))) return false;
        // Posto ripreso da un'altra richiesta (preparazione troppo lenta): vale la sua.
        const slot = await tx.microTestSlot.findFirst({
          where: { ...mine, status: 'PREPARING' },
          select: { id: true },
        });
        if (!slot) return false;
        const last = await tx.calibrationRound.findFirst({
          where: { userId },
          orderBy: { sequence: 'desc' },
          select: { sequence: true },
        });
        const sequence = (last?.sequence ?? 0) + 1;
        const questions = await microTestQuestions(tx, userId, test);
        const round = await tx.calibrationRound.create({
          data: {
            userId,
            sequence,
            kind: 'ADAPTIVE',
            questionsJson: questions as unknown as Prisma.InputJsonValue,
            action: 'PROPOSE_MICRO_TEST',
            targetAreas: [test.areaId],
            rationale: REASON[filter],
            provider: test.provider,
            model: test.model,
            promptVersionId: test.promptVersionId,
            promptHash: test.promptHash,
          },
          select: { id: true },
        });
        await tx.microTestSlot.update({
          where: { id: slot.id },
          data: { status: 'READY', roundId: round.id, token: null },
        });
        await deps.analytics.trackServer(
          'ai_micro_test_presented',
          {
            userId,
            properties: {
              area_id: test.areaId,
              round_sequence: sequence,
              filter,
            },
          },
          tx,
        );
        return true;
      });
    } finally {
      await deps.release(userId, lease);
    }
    return true;
  } finally {
    // Non salvato (AI fallita, fase chiusa, posto perso): il posto si libera.
    if (!saved)
      await prisma.microTestSlot.deleteMany({
        where: { ...mine, status: 'PREPARING' },
      });
  }
}
