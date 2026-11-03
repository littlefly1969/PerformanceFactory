import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AiProposalProviderService } from '../../ai-orchestrator/proposal-provider.service';
import { AssessmentEvaluationInput } from '../../ai-orchestrator/assessment-evaluation-model';
import { AnalyticsService } from '../../analytics/analytics.service';
import { PrismaService } from '../../prisma/prisma.service';
import { requireAiConsent } from '../assessment-evaluation';
import { lockOpenCalibration } from './calibration-closing';
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

const REASON =
  "Micro-test della home: verifica in modo pratico un'area poco sviluppata.";

/** Atleti per cui l'AI sta già preparando il micro-test della home. */
const preparing = new Set<string>();

type Round = Prisma.CalibrationRoundGetPayload<object>;

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

/** Il micro-test della home aperto o in valutazione, se c'è. */
export function openHomeMicroTest(
  db: PrismaService | Prisma.TransactionClient,
  userId: string,
) {
  return db.calibrationRound.findFirst({
    where: {
      userId,
      action: 'PROPOSE_MICRO_TEST',
      status: { in: ['OPEN', 'EVALUATING'] },
    },
    orderBy: { sequence: 'desc' },
  });
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
 * Micro-test della home, fuori dal ciclo di calibrazione: se non ce n'è uno
 * aperto l'AI lo prepara sulle aree meno sviluppate, scegliendo quella dove
 * una prova ha senso e senza ripetere l'ultima. L'AI lavora senza lease:
 * solo il salvataggio lo prende, così le domande di calibrazione non
 * aspettano. Restituisce false se la fase gratuita è chiusa.
 */
export async function prepareHomeMicroTest(
  deps: PrepareDeps,
  userId: string,
  now: Date,
) {
  const { prisma } = deps;
  const calibration = await deps.expireIfDue(userId, now);
  if (!calibration || isCalibrationClosed(calibration.status)) return false;
  await requireAiConsent(prisma, userId);
  if (await openHomeMicroTest(prisma, userId)) return true;
  // Una sola preparazione per atleta: le richieste parallele la trovano poi.
  if (preparing.has(userId)) return true;
  preparing.add(userId);
  try {
    const [rounds, latest] = await Promise.all([
      prisma.calibrationRound.findMany({
        where: { userId },
        orderBy: { sequence: 'asc' },
      }),
      prisma.assessmentEvaluation.findFirstOrThrow({
        where: { userId },
        orderBy: { sequence: 'desc' },
        select: { areas: true },
      }),
    ]);
    const lastArea = rounds
      .filter((r) => r.action === 'PROPOSE_MICRO_TEST')
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
        reason: REASON,
      },
    );
    const lease = await waitClaim(deps, userId);
    try {
      await prisma.$transaction(async (tx) => {
        if (!(await lockOpenCalibration(tx, userId, new Date()))) return;
        if (await openHomeMicroTest(tx, userId)) return;
        const last = await tx.calibrationRound.findFirst({
          where: { userId },
          orderBy: { sequence: 'desc' },
          select: { sequence: true },
        });
        const sequence = (last?.sequence ?? 0) + 1;
        const questions = await microTestQuestions(tx, userId, test);
        await tx.calibrationRound.create({
          data: {
            userId,
            sequence,
            kind: 'ADAPTIVE',
            questionsJson: questions as unknown as Prisma.InputJsonValue,
            action: 'PROPOSE_MICRO_TEST',
            targetAreas: [test.areaId],
            rationale: REASON,
            provider: test.provider,
            model: test.model,
            promptVersionId: test.promptVersionId,
            promptHash: test.promptHash,
          },
        });
        await deps.analytics.trackServer(
          'ai_micro_test_presented',
          {
            userId,
            properties: { area_id: test.areaId, round_sequence: sequence },
          },
          tx,
        );
      });
    } finally {
      await deps.release(userId, lease);
    }
    return true;
  } finally {
    preparing.delete(userId);
  }
}
