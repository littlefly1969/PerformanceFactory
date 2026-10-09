import { Prisma } from '@prisma/client';
import type { AnalyticsEventName } from '../analytics/analytics-events';
import type { MeaningfulSource } from './engagement-rules';

type Db = Pick<Prisma.TransactionClient, 'userEngagement' | 'analyticsEvent'>;

/**
 * Registra un'interazione significativa (§8.3) e aggiorna l'engagement nella
 * stessa transazione del dato che la produce. Da DORMANT l'atleta torna
 * REACTIVATED con un solo `user_reactivated` anche con richieste concorrenti:
 * la transizione è un update condizionale sullo stato (AT-23). Il risveglio
 * in-app sparisce da solo perché vale solo in DORMANT.
 */
export async function recordMeaningfulInteraction(
  db: Db,
  userId: string,
  source: MeaningfulSource,
  now = new Date(),
) {
  const reactivated = await db.userEngagement.updateMany({
    where: { userId, state: 'DORMANT' },
    data: {
      state: 'REACTIVATED',
      lastMeaningfulAt: now,
      stateChangedAt: now,
      reactivatedAt: now,
    },
  });
  if (!reactivated.count) {
    await db.userEngagement.updateMany({
      where: { userId, state: 'SLEEPY' },
      data: { state: 'ACTIVE_RECENT', stateChangedAt: now },
    });
    await db.userEngagement.upsert({
      where: { userId },
      create: { userId, lastMeaningfulAt: now, stateChangedAt: now },
      update: { lastMeaningfulAt: now },
    });
  }
  const names: AnalyticsEventName[] = reactivated.count
    ? ['meaningful_interaction', 'user_reactivated']
    : ['meaningful_interaction'];
  await db.analyticsEvent.createMany({
    data: names.map((name) => ({
      name,
      occurredAt: now,
      userId,
      origin: 'SERVER',
      properties: { source },
    })),
  });
  return { reactivated: reactivated.count > 0 };
}
