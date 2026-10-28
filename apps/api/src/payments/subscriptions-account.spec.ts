import {
  PaymentProviderKind,
  Subscription,
  SubscriptionStatus,
} from '@prisma/client';
import { SubscriptionsService } from './subscriptions.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { PaymentProviderRegistry } from './providers/payment-provider.registry';

const NOW = new Date('2026-10-28T10:00:00Z');
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const subscription = (over: Partial<Subscription>): Subscription =>
  ({
    id: 's1',
    userId: 'u1',
    horizon: 'PROGRAM_6M',
    billingCycle: 'MONTHLY',
    status: SubscriptionStatus.ACTIVE,
    provider: PaymentProviderKind.STRIPE,
    purchaseChannel: 'WEB',
    amountCents: 2900,
    currency: 'eur',
    providerSubscriptionId: 'sub_1',
    currentPeriodStart: day(-10),
    entitlementEndAt: day(20),
    nextChargeAt: day(20),
    cancelAtPeriodEnd: false,
    graceEndsAt: null,
    programStartedAt: day(-10),
    programEndsAt: day(170),
    endedAt: null,
    checkoutExpiresAt: null,
    createdAt: day(-10),
    ...over,
  }) as Subscription;

/** findFirst risponde nell'ordine: abbonamento in corso, in verifica, terminato. */
function service(...answers: (Subscription | null)[]) {
  const findFirst = jest.fn();
  for (const answer of answers) findFirst.mockResolvedValueOnce(answer);
  findFirst.mockResolvedValue(null);
  return new SubscriptionsService(
    { subscription: { findFirst } } as unknown as PrismaService,
    {} as PaymentProviderRegistry,
  );
}

describe('SubscriptionsService.account', () => {
  it('shows an active contract with the cancellation allowed until the notice', async () => {
    const view = await service(subscription({})).account('u1', NOW);
    expect(view).toMatchObject({
      state: 'ACTIVE',
      entitled: true,
      canCancel: true,
      canResume: false,
      subscription: { horizon: 'PROGRAM_6M', amountCents: 2900 },
    });
    expect(view.subscription).not.toHaveProperty('providerSubscriptionId');
    const late = await service(
      subscription({ entitlementEndAt: new Date(NOW.getTime() + 3_600_000) }),
    ).account('u1', NOW);
    expect(late.canCancel).toBe(false);
  });

  it('offers the resume of a cancellation still in time', async () => {
    const view = await service(
      subscription({ cancelAtPeriodEnd: true, nextChargeAt: null }),
    ).account('u1', NOW);
    expect(view).toMatchObject({ canCancel: false, canResume: true });
  });

  it('keeps grace and pause apart from a new purchase', async () => {
    expect(
      await service(
        subscription({
          status: SubscriptionStatus.PAYMENT_GRACE,
          graceEndsAt: day(3),
        }),
      ).account('u1', NOW),
    ).toMatchObject({ state: 'GRACE', entitled: true });
    expect(
      await service(
        subscription({ status: SubscriptionStatus.PAUSED }),
      ).account('u1', NOW),
    ).toMatchObject({ state: 'PAUSED', entitled: false, canCancel: false });
  });

  it('shows a payment still being confirmed, then the last ended contract, then nothing', async () => {
    expect(
      await service(
        null,
        subscription({
          status: SubscriptionStatus.CHECKOUT_PENDING,
          checkoutExpiresAt: day(1),
        }),
      ).account('u1', NOW),
    ).toMatchObject({ state: 'PENDING', entitled: false });
    expect(
      await service(
        null,
        null,
        subscription({ status: SubscriptionStatus.EXPIRED, endedAt: day(-2) }),
      ).account('u1', NOW),
    ).toMatchObject({ state: 'ENDED', subscription: { endedAt: day(-2) } });
    expect(await service().account('u1', NOW)).toMatchObject({
      state: 'NONE',
      subscription: null,
    });
  });
});
