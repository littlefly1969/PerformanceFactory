import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CompletePlanItemDto } from '../user-plan/dto/complete-plan-item.dto';
import { sessionDay } from './training-sessions';

/**
 * Gemella di createTrainingSessions per le aree a calendario. Gira nella
 * transazione di pubblicazione e preserva occorrenze ed esiti gia presenti.
 */
export async function createAreaSessions(
  tx: Prisma.TransactionClient,
  planReleaseId: string,
) {
  const plan = await tx.improvementPlanRelease.findUniqueOrThrow({
    where: { id: planReleaseId },
    select: {
      userId: true,
      areaId: true,
      startsOn: true,
      windowDays: true,
      items: {
        orderBy: { id: 'asc' },
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
  if (!plan.startsOn) return;
  const windowDays = plan.windowDays ?? 14;
  const dates = plan.items.map((item, index) =>
    sessionDay(
      plan.startsOn!,
      index,
      plan.items.length,
      item.metadata,
      windowDays,
      true,
    ),
  );
  if (new Set(dates.map((date) => date.getTime())).size !== dates.length)
    throw new BadRequestException('Calendario area con giorni duplicati');
  const order = [...dates.keys()].sort(
    (a, b) => dates[a].getTime() - dates[b].getTime(),
  );
  await tx.areaSession.createMany({
    skipDuplicates: true,
    data: order.map((itemIndex, position) => {
      const item = plan.items[itemIndex];
      return {
        userId: plan.userId,
        areaId: plan.areaId,
        planReleaseId,
        planItemId: item.id,
        sequence: position + 1,
        scheduledDate: dates[itemIndex],
        status:
          item.status === 'COMPLETED'
            ? ('COMPLETED' as const)
            : item.status === 'SKIPPED'
              ? ('SKIPPED' as const)
              : ('SCHEDULED' as const),
        completedAt: item.completedAt,
        completionNotes: item.completionNotes,
        completionRating: item.completionRating,
      };
    }),
  });
}

export async function finishAreaSession(
  prisma: PrismaService,
  userId: string,
  id: string,
  status: 'COMPLETED' | 'SKIPPED',
  input: CompletePlanItemDto = {},
) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.areaSession.findFirst({
      where: { id, userId },
      include: { planRelease: { select: { status: true } } },
    });
    if (!session) throw new NotFoundException('Sessione non trovata');
    if (session.status === status) return { id, status };
    if (session.planRelease.status !== 'ACTIVE')
      throw new BadRequestException('Il piano non è più attivo'); // Safe request retry.
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
    const changed = await tx.areaSession.updateMany({
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
    const item = await tx.planItem.updateMany({
      where: {
        id: session.planItemId,
        planReleaseId: session.planReleaseId,
        status: 'ACTIVE',
      },
      data: { status, ...completion },
    });
    if (item.count !== 1)
      throw new ConflictException(
        'Attività già aggiornata. Ricarica il calendario.',
      );
    await tx.cycleAuditLog.create({
      data: {
        userId,
        planReleaseId: session.planReleaseId,
        actorId: userId,
        action:
          status === 'COMPLETED'
            ? 'AREA_SESSION_COMPLETED'
            : 'AREA_SESSION_SKIPPED',
        source: 'USER',
        metadata: { areaSessionId: id },
      },
    });
    return { id, status };
  });
}
