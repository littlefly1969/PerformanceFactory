import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AnalyticsEventName } from '../analytics/analytics-events';
import { thresholds } from './engagement-rules';

const BATCH = 200;

/**
 * Risveglio in-app (OP-07) letto dal percorso: vale solo in DORMANT, quindi
 * la prima interazione significativa lo chiude senza altre azioni (§8.4).
 */
export async function pendingWakeup(
  prisma: Pick<PrismaService, 'userEngagement'>,
  userId: string,
) {
  const row = await prisma.userEngagement.findUnique({
    where: { userId },
    select: { state: true, wakeupSentAt: true },
  });
  return row?.state === 'DORMANT' && row.wakeupSentAt !== null;
}
const AWAKE = ['ACTIVE_RECENT', 'REACTIVATED'];

/**
 * Classificazione periodica dell'engagement (§8.2, §8.4). Ogni passaggio è un
 * update condizionale sullo stato di partenza: più istanze o più esecuzioni
 * dello stesso controllo non duplicano eventi né risvegli (AT-22).
 */
@Injectable()
export class EngagementService {
  constructor(private readonly prisma: PrismaService) {}

  async classify(now = new Date()) {
    await this.enrollAthletes(now);
    const { sleepyBefore, dormantAtOrBefore } = thresholds(now);
    const dormant = await this.transition(
      {
        state: { not: 'DORMANT' },
        lastMeaningfulAt: { lte: dormantAtOrBefore },
      },
      { state: 'DORMANT', stateChangedAt: now, wakeupSentAt: now },
      ['user_became_dormant', 'wakeup_sent'],
      now,
    );
    const sleepy = await this.transition(
      {
        state: { in: AWAKE },
        lastMeaningfulAt: { lt: sleepyBefore, gt: dormantAtOrBefore },
      },
      { state: 'SLEEPY', stateChangedAt: now },
      ['user_became_sleepy'],
      now,
    );
    return { sleepy, dormant };
  }

  /**
   * Atleti senza riga: senza interazioni dopo la registrazione, il punto di
   * partenza è la registrazione (§8.2). Solo account attivi: un account non
   * abilitato non può tornare e non riceve risvegli.
   */
  private enrollAthletes(now: Date) {
    return this.prisma.$executeRaw`
      INSERT INTO "UserEngagement" ("userId", "lastMeaningfulAt", "stateChangedAt")
      SELECT u."id", u."createdAt", ${now}
      FROM "User" u
      WHERE u."role" = 'USER' AND u."isActive" = true
        AND NOT EXISTS (SELECT 1 FROM "UserEngagement" e WHERE e."userId" = u."id")
      ON CONFLICT ("userId") DO NOTHING`;
  }

  private async transition(
    where: Prisma.UserEngagementWhereInput,
    data: Prisma.UserEngagementUpdateManyMutationInput,
    events: AnalyticsEventName[],
    now: Date,
  ) {
    const scope = { ...where, user: { isActive: true } };
    let moved = 0;
    let cursor: string | undefined;
    for (;;) {
      const batch = await this.prisma.userEngagement.findMany({
        where: { ...scope, ...(cursor ? { userId: { gt: cursor } } : {}) },
        orderBy: { userId: 'asc' },
        take: BATCH,
        select: { userId: true },
      });
      if (!batch.length) return moved;
      cursor = batch[batch.length - 1].userId;
      for (const { userId } of batch) {
        const done = await this.prisma.$transaction(async (tx) => {
          // Rilegge la condizione: un'interazione appena arrivata vince.
          const claimed = await tx.userEngagement.updateMany({
            where: { ...where, userId },
            data,
          });
          if (!claimed.count) return false;
          await tx.analyticsEvent.createMany({
            data: events.map((name) => ({
              name,
              occurredAt: now,
              userId,
              origin: 'SERVER',
              properties: name === 'wakeup_sent' ? { channel: 'IN_APP' } : {},
            })),
          });
          return true;
        });
        if (done) moved += 1;
      }
    }
  }
}
