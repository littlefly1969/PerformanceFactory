import { Prisma } from '@prisma/client';
import { CLOSED_CALIBRATION_STATUSES } from './calibration-rules';

/**
 * Unico motivo di chiusura: la regola di consolidamento soddisfatta. Le
 * chiusure per scadenza o round di chiusura (CLOSING_ASSESSMENT,
 * DEADLINE_REACHED) restano solo nello storico (PF-FS-PREPAYWALL §7.2).
 */
export type CompletionReason = 'CONFIDENCE_REACHED';

/**
 * Chiude la calibrazione e consolida l'ultima valutazione nella stessa
 * transazione, così stato del percorso e valutazione non divergono. Va
 * chiamata solo quando l'ultima valutazione soddisfa la regola indicata, che
 * resta registrata come base del consolidamento. I valori restano quelli
 * stimati: nessuna confidence viene alzata o inventata.
 * Restituisce false se la calibrazione era già chiusa.
 */
export async function completeCalibration(
  tx: Prisma.TransactionClient,
  userId: string,
  reason: CompletionReason,
  now: Date,
  policyId: string,
) {
  const closed = await tx.athleteCalibration.updateMany({
    where: { userId, status: { notIn: [...CLOSED_CALIBRATION_STATUSES] } },
    data: {
      status: 'CALIBRATION_COMPLETED',
      completedAt: now,
      completionReason: reason,
      consolidationPolicyId: policyId,
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
      data: { status: 'CONSOLIDATED', consolidationPolicyId: policyId },
    });
  return true;
}
