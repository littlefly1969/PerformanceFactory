import { AssessmentEvaluationInput } from '../../ai-orchestrator/assessment-evaluation-model';
import { AiProposalProviderService } from '../../ai-orchestrator/proposal-provider.service';
import { PrismaService } from '../../prisma/prisma.service';
import { saveEvaluation } from '../assessment-evaluation';
import { completeCalibration } from '../calibration/calibration-completion';
import { loadCalibrationSettings } from '../calibration/calibration-config';
import {
  CalibrationStatus,
  isCalibrationClosed,
  statusAfterEvaluation,
} from '../calibration/calibration-rules';
import { checkRule, loadActivePolicy } from '../calibration/confidence-policy';
import { lessonGate } from '../calibration/lesson-gate';
import {
  addLessonEvidence,
  lockCalibration,
} from '../calibration/lesson-evidence';
import { linkFeedback } from '../calibration/lesson-feedback';

type EvaluatedRound = {
  status: string;
  questionsJson: unknown;
  answersJson: unknown;
};

/**
 * Nuova valutazione dopo una correzione della classifica FIT: stesse
 * evidenze, classifica aggiornata. A calibrazione aperta valgono le regole di
 * sempre. A calibrazione chiusa la nuova R è consolidata solo se soddisfa
 * ancora la regola di consolidamento, e allora P4/P6/P12 si rigenerano su di
 * essa; altrimenti resta provvisoria e la R consolidata precedente rimane
 * quella mostrata. Il programma già creato non cambia. Va chiamata sotto il
 * lease dell'atleta. Restituisce false se non c'è ancora una valutazione.
 */
export async function reevaluateForRanking(
  prisma: PrismaService,
  ai: AiProposalProviderService,
  userId: string,
  buildInput: (rounds: EvaluatedRound[]) => Promise<AssessmentEvaluationInput>,
) {
  const rounds = await prisma.calibrationRound.findMany({
    where: { userId, status: 'EVALUATED' },
    orderBy: { sequence: 'asc' },
  });
  const input = await buildInput(rounds);
  // Micro-test e feedback del coach restano evidenze anche qui.
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
    const last = await tx.assessmentEvaluation.findFirstOrThrow({
      where: { userId },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });
    const closed = isCalibrationClosed(current.status);
    const saved = await saveEvaluation(tx, userId, input, result, {
      sequence: last.sequence + 1,
      source: 'FIT_RANKING_UPDATE',
      interaction: 'FIT_RANKING_UPDATE',
      consolidationPolicyId: policy.id,
      ...(closed && checkRule(policy, result.output).met
        ? { status: 'CONSOLIDATED' }
        : {}),
    });
    await linkFeedback(tx, feedbackIds, saved.id);
    await tx.athleteFitRanking.updateMany({
      where: { userId, recalculatedAt: null },
      data: { recalculatedAt: now },
    });
    if (closed) return true;
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
