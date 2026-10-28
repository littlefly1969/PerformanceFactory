import { Prisma } from '@prisma/client';
import type { AnalyticsEventName } from '../../analytics/analytics-events';
import { CLOSED_CALIBRATION_STATUSES } from './calibration-rules';

/**
 * Motivi di chiusura: R consolidata (con la lezione svolta o per scelta
 * dell'atleta) oppure scadenza della fase gratuita. CLOSING_ASSESSMENT resta
 * solo nello storico.
 */
export type CompletionReason = 'CONFIDENCE_REACHED' | 'DEADLINE_REACHED';

/**
 * Chiude la calibrazione e consolida l'ultima valutazione nella stessa
 * transazione, così stato del percorso e valutazione non divergono. Fuori
 * dalla scadenza va chiamata solo quando l'ultima valutazione soddisfa la
 * regola indicata, che resta registrata come base del consolidamento. Alla
 * scadenza `ruleMet` dice se R era davvero consolidata: altrimenti la
 * valutazione diventa comunque la base di P, ma resta una stima a bassa
 * affidabilità (§7.2). I valori restano quelli stimati: nessuna confidence
 * viene alzata o inventata.
 * Restituisce false se la calibrazione era già chiusa.
 */
export async function completeCalibration(
  tx: Prisma.TransactionClient,
  userId: string,
  reason: CompletionReason,
  now: Date,
  policyId: string,
  ruleMet = true,
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
  // Domande lasciate a metà: con la calibrazione chiusa non servono più.
  await tx.calibrationRound.updateMany({
    where: { userId, status: 'OPEN' },
    data: { status: 'EXPIRED' },
  });
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
  const name: AnalyticsEventName = 'r_consolidated';
  await tx.analyticsEvent.create({
    data: {
      name,
      occurredAt: now,
      userId,
      origin: 'SERVER',
      properties: { reason, rule_met: ruleMet },
    },
  });
  return true;
}
