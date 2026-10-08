import { Prisma } from '@prisma/client';
import {
  CLOSED_CALIBRATION_STATUSES,
  isCalibrationClosed,
} from './calibration-rules';

export type CompletionReason =
  | 'CONFIDENCE_REACHED'
  | 'CLOSING_ASSESSMENT'
  | 'DEADLINE_REACHED';

/**
 * Chiude la calibrazione e consolida l'ultima valutazione nella stessa
 * transazione, così stato del percorso e valutazione non divergono. I valori
 * restano quelli stimati: nessuna confidence viene alzata o inventata.
 * Restituisce false se la calibrazione era già chiusa.
 */
export async function completeCalibration(
  tx: Prisma.TransactionClient,
  userId: string,
  reason: CompletionReason,
  now: Date,
) {
  const closed = await tx.athleteCalibration.updateMany({
    where: { userId, status: { notIn: [...CLOSED_CALIBRATION_STATUSES] } },
    data: {
      status: 'CALIBRATION_COMPLETED',
      completedAt: now,
      completionReason: reason,
    },
  });
  if (!closed.count) return false;
  const latest = await tx.assessmentEvaluation.findFirst({
    where: { userId },
    orderBy: { sequence: 'desc' },
    select: { id: true },
  });
  if (latest)
    await tx.assessmentEvaluation.update({
      where: { id: latest.id },
      data: { status: 'CONSOLIDATED' },
    });
  return true;
}

/**
 * Tetto della calibrazione: alla scadenza i round non ancora valutati scadono e
 * si consolida con i dati disponibili. Va chiamata sotto il lease dell'atleta.
 */
export async function closeAtDeadline(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date,
) {
  const calibration = await tx.athleteCalibration.findUnique({
    where: { userId },
    select: { status: true, deadlineAt: true },
  });
  if (
    !calibration ||
    isCalibrationClosed(calibration.status) ||
    calibration.deadlineAt > now
  )
    return false;
  await tx.calibrationRound.updateMany({
    where: { userId, status: { in: ['OPEN', 'EVALUATING'] } },
    data: { status: 'EXPIRED', evaluationToken: null },
  });
  return completeCalibration(tx, userId, 'DEADLINE_REACHED', now);
}
