import { Prisma } from '@prisma/client';
import { AssessmentEvaluationInput } from '../../ai-orchestrator/assessment-evaluation-model';
import { AiProposalProviderService } from '../../ai-orchestrator/proposal-provider.service';
import { PrismaService } from '../../prisma/prisma.service';
import { saveEvaluation } from '../assessment-evaluation';
import { completeCalibration } from './calibration-completion';
import { loadCalibrationSettings } from './calibration-config';
import { CalibrationStatus, statusAfterEvaluation } from './calibration-rules';
import { loadActivePolicy } from './confidence-policy';
import { lessonGate } from './lesson-gate';
import {
  addLessonEvidence,
  isCalibrationOpen,
  lockCalibration,
} from './lesson-evidence';

type EvaluatedRound = {
  status: string;
  questionsJson: unknown;
  answersJson: unknown;
};

/** Collega il feedback a una sola valutazione: la prima che lo incorpora. */
export function linkFeedback(
  tx: Prisma.TransactionClient,
  ids: string[],
  evaluationId: string,
) {
  return tx.coachLessonFeedback.updateMany({
    where: { id: { in: ids }, evaluationId: null },
    data: { evaluationId },
  });
}

/**
 * Nuova valutazione con il feedback del coach ancora in attesa: R e confidence
 * si aggiornano con la fonte COACH_LESSON e la regola di consolidamento può
 * chiudere la calibrazione. Va chiamata sotto il lease
 * dell'atleta. Restituisce true se ha salvato una valutazione.
 */
export async function evaluatePendingFeedback(
  prisma: PrismaService,
  ai: AiProposalProviderService,
  userId: string,
  buildInput: (rounds: EvaluatedRound[]) => Promise<AssessmentEvaluationInput>,
) {
  const [pending, calibration] = await Promise.all([
    prisma.coachLessonFeedback.count({ where: { userId, evaluationId: null } }),
    prisma.athleteCalibration.findUnique({ where: { userId } }),
  ]);
  if (!pending || !isCalibrationOpen(calibration?.status)) return false;
  const rounds = await prisma.calibrationRound.findMany({
    where: { userId, status: 'EVALUATED' },
    orderBy: { sequence: 'asc' },
  });
  const input = await buildInput(rounds);
  const feedbackIds = await addLessonEvidence(prisma, userId, input);
  const result = await ai.evaluateAssessment(input);
  const [settings, policy] = await Promise.all([
    loadCalibrationSettings(prisma),
    loadActivePolicy(prisma, 'R_CONSOLIDATION'),
  ]);
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    await lockCalibration(tx, userId);
    const current = await tx.athleteCalibration.findUniqueOrThrow({
      where: { userId },
    });
    if (!isCalibrationOpen(current.status)) return false;
    // Un'altra valutazione ha già incorporato questo feedback.
    const fresh = await tx.coachLessonFeedback.count({
      where: { id: { in: feedbackIds }, evaluationId: null },
    });
    if (!fresh) return false;
    const last = await tx.assessmentEvaluation.findFirstOrThrow({
      where: { userId },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });
    const saved = await saveEvaluation(tx, userId, input, result, {
      sequence: last.sequence + 1,
      source: 'COACH_LESSON',
      consolidationPolicyId: policy.id,
    });
    await linkFeedback(tx, feedbackIds, saved.id);
    const next = statusAfterEvaluation(
      current.status as CalibrationStatus,
      result.output,
      settings,
      policy,
      await lessonGate(tx, userId, result.output),
    );
    if (next.completionReason)
      await completeCalibration(
        tx,
        userId,
        next.completionReason,
        now,
        policy.id,
      );
    else
      await tx.athleteCalibration.update({
        where: { userId },
        data: {
          status: next.status,
          ...(next.levelEstimated ? { levelEstimatedAt: now } : {}),
        },
      });
    return true;
  });
}
