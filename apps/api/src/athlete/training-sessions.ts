import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CompletePlanItemDto } from '../user-plan/dto/complete-plan-item.dto';

export const ATHLETE_TIME_ZONE = 'Europe/Rome';
export const terminalTrainingStates = ['COMPLETED', 'SKIPPED'];
export function athleteDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ATHLETE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
export function dateOnly(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    throw new BadRequestException('Data non valida: usa YYYY-MM-DD');
  return date;
}
export function calendarRange(from: string, to: string) {
  const start = dateOnly(from),
    end = dateOnly(to);
  if (end < start || end.getTime() - start.getTime() > 92 * 86400000)
    throw new BadRequestException(
      'Il calendario accetta un intervallo massimo di 93 giorni',
    );
  return { gte: start, lte: end };
}
export function presentationStatus(
  status: string,
  date: string,
  today: string,
) {
  if (status === 'COMPLETED') return 'DONE';
  if (status === 'SKIPPED') return 'SKIPPED';
  return date === today ? 'TODAY' : date < today ? 'MISSED' : 'SCHEDULED';
}
export function sessionDay(
  start: Date,
  index: number,
  count: number,
  metadata: Prisma.JsonValue | null,
) {
  const schedule =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? metadata.schedule
      : null;
  const offset =
    schedule && typeof schedule === 'object' && !Array.isArray(schedule)
      ? schedule.dayOffset
      : null;
  const dayOffset =
    typeof offset === 'number' &&
    Number.isInteger(offset) &&
    offset >= 0 &&
    offset <= 6
      ? offset
      : Math.floor((index * 7) / count);
  return new Date(start.getTime() + dayOffset * 86400000);
}

/** Runs in the publication transaction; retries preserve existing occurrences and outcomes. */
export async function createTrainingSessions(
  tx: Prisma.TransactionClient,
  releaseId: string,
  publishedAt: Date,
) {
  const plan = await tx.trainingPlanRelease.findUniqueOrThrow({
    where: { id: releaseId },
    select: {
      userId: true,
      items: {
        orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          metadata: true,
          status: true,
          completedAt: true,
          completionNotes: true,
          completionRating: true,
        },
      },
    },
  });
  const start = dateOnly(athleteDate(publishedAt));
  await tx.trainingSession.createMany({
    skipDuplicates: true,
    data: plan.items.map((item, index) => ({
      userId: plan.userId,
      trainingPlanReleaseId: releaseId,
      trainingPlanItemId: item.id,
      sequence: index + 1,
      scheduledDate: sessionDay(start, index, plan.items.length, item.metadata),
      status:
        item.status === 'COMPLETED'
          ? 'COMPLETED'
          : item.status === 'SKIPPED'
            ? 'SKIPPED'
            : 'SCHEDULED',
      completedAt: item.completedAt,
      completionNotes: item.completionNotes,
      completionRating: item.completionRating,
    })),
  });
}

export async function finishTrainingSession(
  prisma: PrismaService,
  userId: string,
  id: string,
  status: 'COMPLETED' | 'SKIPPED',
  input: CompletePlanItemDto = {},
) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.trainingSession.findFirst({
      where: { id, userId },
      include: { trainingPlanRelease: { select: { status: true } } },
    });
    if (!session) throw new NotFoundException('Sessione non trovata');
    if (session.trainingPlanRelease.status !== 'ACTIVE')
      throw new BadRequestException('Il programma non è più attivo');
    if (session.status === status) return { id, status }; // Safe request retry.
    if (session.status !== 'SCHEDULED')
      throw new ConflictException('Sessione già conclusa');
    const now = new Date();
    const completion =
      status === 'COMPLETED'
        ? {
            completedAt: now,
            completionNotes: input.completionNotes,
            completionRating: input.completionRating,
          }
        : {};
    const changed = await tx.trainingSession.updateMany({
      where: { id, userId, status: 'SCHEDULED' },
      data: {
        status,
        ...completion,
        ...(status === 'SKIPPED' ? { skippedAt: now } : {}),
      },
    });
    if (changed.count !== 1)
      throw new ConflictException(
        'Sessione già aggiornata. Ricarica il calendario.',
      );
    const item = await tx.trainingPlanItem.updateMany({
      where: {
        id: session.trainingPlanItemId,
        trainingPlanReleaseId: session.trainingPlanReleaseId,
        status: 'ACTIVE',
      },
      data: { status, ...completion },
    });
    if (item.count !== 1)
      throw new ConflictException(
        'Esercizio già aggiornato. Ricarica il calendario.',
      );
    return { id, status };
  });
}

export async function assertTrainingCycleFinished(
  tx: Pick<Prisma.TransactionClient, 'trainingPlanRelease'>,
  userId: string,
) {
  const active = await tx.trainingPlanRelease.findFirst({
    where: { userId, status: 'ACTIVE' },
    select: {
      items: { select: { status: true } },
      questionSets: { select: { status: true } },
    },
  });
  if (
    active &&
    (!active.items.length ||
      active.items.some((i) => !terminalTrainingStates.includes(i.status)) ||
      !active.questionSets.length ||
      active.questionSets.some((q) => q.status !== 'CLOSED'))
  )
    throw new BadRequestException(
      'Completa o salta le sessioni e rispondi al check-in prima del prossimo ciclo',
    );
}
