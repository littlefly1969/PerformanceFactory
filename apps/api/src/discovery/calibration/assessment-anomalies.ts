import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

/** Stati di revisione di una segnalazione (OP-08). */
export const ANOMALY_STATUSES = ['OPEN', 'REVIEWED', 'ARCHIVED'] as const;
export type AnomalyStatus = (typeof ANOMALY_STATUSES)[number];

/**
 * Una segnalazione HIGH ancora aperta sospende solo l'eleggibilità alla
 * lezione gratuita (OP-08): nessuna esclusione dal percorso, nessun segnale
 * all'atleta, che continua a ricevere domande e chiarimenti.
 */
export async function lessonSuspended(db: Db, userId: string) {
  return (
    (await db.assessmentAnomaly.count({
      where: { userId, priority: 'HIGH', status: 'OPEN' },
    })) > 0
  );
}

/** Coda di revisione per l'admin, le aperte per prime. */
export async function listAnomalies(
  prisma: PrismaService,
  status?: AnomalyStatus,
) {
  const rows = await prisma.assessmentAnomaly.findMany({
    where: status ? { status } : {},
    orderBy: [{ createdAt: 'desc' }],
    take: 200,
    include: {
      user: { select: { email: true, firstName: true, lastName: true } },
      evaluation: { select: { sequence: true, source: true } },
      reviewedBy: { select: { email: true } },
    },
  });
  const rank = (s: string) => ANOMALY_STATUSES.indexOf(s as AnomalyStatus);
  return rows
    .sort((a, b) => rank(a.status) - rank(b.status))
    .map((a) => ({
      id: a.id,
      userId: a.userId,
      athlete: {
        email: a.user.email,
        name: [a.user.firstName, a.user.lastName].filter(Boolean).join(' '),
      },
      evaluation: a.evaluation,
      kind: a.kind,
      priority: a.priority,
      evidence: a.evidence,
      status: a.status,
      reviewNote: a.reviewNote,
      reviewedBy: a.reviewedBy?.email ?? null,
      reviewedAt: a.reviewedAt,
      createdAt: a.createdAt,
    }));
}

/** Esito della revisione, con chi l'ha fatta e quando (audit). */
export async function reviewAnomaly(
  prisma: PrismaService,
  id: string,
  actorId: string,
  status: AnomalyStatus,
  note: string | null,
) {
  const updated = await prisma.assessmentAnomaly.updateMany({
    where: { id },
    data: {
      status,
      reviewNote: note,
      reviewedById: status === 'OPEN' ? null : actorId,
      reviewedAt: status === 'OPEN' ? null : new Date(),
    },
  });
  if (!updated.count) throw new NotFoundException('Segnalazione non trovata');
  return { id, status };
}
