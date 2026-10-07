import { SubscriptionStatus } from '@prisma/client';
import { NormalizedPaymentEvent } from './providers/payment-provider';
import {
  hasEntitlement,
  SubscriptionSnapshot,
  transitionSubscription,
} from './subscription-transitions';

const now = new Date('2026-10-07T10:00:00.000Z');
const base = {
  eventId: 'evt',
  rawType: 'test',
  payload: {},
  occurredAt: now,
  localSubscriptionId: null,
};

function snapshot(overrides: Partial<SubscriptionSnapshot> = {}) {
  return {
    status: SubscriptionStatus.CHECKOUT_PENDING,
    horizon: 'PROGRAM_12M',
    billingCycle: 'MONTHLY',
    entitlementEndAt: null,
    graceEndsAt: null,
    programStartedAt: null,
    programEndsAt: null,
    lastProviderEventAt: null,
    ...overrides,
  } as SubscriptionSnapshot;
}

const active = snapshot({
  status: SubscriptionStatus.ACTIVE,
  entitlementEndAt: new Date('2026-11-07T10:00:00.000Z'),
  programStartedAt: new Date('2026-10-07T10:00:00.000Z'),
  programEndsAt: new Date('2027-10-07T10:00:00.000Z'),
});

function event(e: Record<string, unknown>) {
  return { ...base, ...e } as NormalizedPaymentEvent;
}

describe('transitionSubscription', () => {
  it('activates on paid checkout keeping horizon and billing cycle separate', () => {
    const result = transitionSubscription(
      snapshot(),
      event({
        kind: 'CHECKOUT_COMPLETED',
        checkoutId: 'cs',
        subscriptionRef: 'sub',
        customerRef: 'cus',
        paid: true,
        period: null,
      }),
      now,
      6,
    );
    expect(result.outcome).toBe('ACTIVATED');
    expect(result.patch).toMatchObject({
      status: 'ACTIVE',
      programStartedAt: now,
      // Orizzonte 12 mesi anche se si paga mensilmente.
      programEndsAt: new Date('2027-10-07T10:00:00.000Z'),
      entitlementEndAt: new Date('2026-11-07T10:00:00.000Z'),
      nextChargeAt: new Date('2026-11-07T10:00:00.000Z'),
      cancelAtPeriodEnd: false,
    });
  });

  it('waits for the payment when checkout completes unpaid', () => {
    const result = transitionSubscription(
      snapshot(),
      event({
        kind: 'CHECKOUT_COMPLETED',
        checkoutId: 'cs',
        subscriptionRef: 'sub',
        customerRef: null,
        paid: false,
        period: null,
      }),
      now,
      6,
    );
    expect(result.outcome).toBe('NO_CHANGE');
  });

  it('starts a 6 day grace period on a failed renewal and recovers on payment', () => {
    const failed = transitionSubscription(
      active,
      event({ kind: 'PAYMENT_FAILED', subscriptionRef: 'sub' }),
      now,
      6,
    );
    expect(failed.outcome).toBe('PAYMENT_GRACE_STARTED');
    expect(failed.patch.graceEndsAt).toEqual(
      new Date('2026-10-13T10:00:00.000Z'),
    );

    const inGrace = { ...active, ...failed.patch } as SubscriptionSnapshot;
    const recovered = transitionSubscription(
      inGrace,
      event({
        kind: 'PAYMENT_SUCCEEDED',
        subscriptionRef: 'sub',
        periodEnd: new Date('2026-12-07T10:00:00.000Z'),
      }),
      now,
      6,
    );
    expect(recovered.outcome).toBe('PAYMENT_RECOVERED');
    expect(recovered.patch).toMatchObject({
      status: 'ACTIVE',
      graceEndsAt: null,
      entitlementEndAt: new Date('2026-12-07T10:00:00.000Z'),
    });
  });

  it('renews without moving the program horizon', () => {
    const result = transitionSubscription(
      active,
      event({
        kind: 'SUBSCRIPTION_UPDATED',
        subscriptionRef: 'sub',
        state: 'ACTIVE',
        period: {
          currentPeriodStart: new Date('2026-11-07T10:00:00.000Z'),
          currentPeriodEnd: new Date('2026-12-07T10:00:00.000Z'),
          cancelAtPeriodEnd: false,
        },
      }),
      now,
      6,
    );
    expect(result.outcome).toBe('RENEWED');
    expect(result.patch.programEndsAt).toBeUndefined();
  });

  it('records cancel at period end without removing access', () => {
    const result = transitionSubscription(
      active,
      event({
        kind: 'SUBSCRIPTION_UPDATED',
        subscriptionRef: 'sub',
        state: 'ACTIVE',
        period: {
          currentPeriodStart: now,
          currentPeriodEnd: active.entitlementEndAt,
          cancelAtPeriodEnd: true,
        },
      }),
      now,
      6,
    );
    expect(result.outcome).toBe('UPDATED');
    expect(result.patch).toMatchObject({
      cancelAtPeriodEnd: true,
      nextChargeAt: null,
      entitlementEndAt: active.entitlementEndAt,
    });
  });

  it('maps pause, end and checkout expiry to distinct states', () => {
    const period = {
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };
    expect(
      transitionSubscription(
        active,
        event({
          kind: 'SUBSCRIPTION_UPDATED',
          subscriptionRef: 'sub',
          state: 'PAUSED',
          period,
        }),
        now,
        6,
      ).patch.status,
    ).toBe('PAUSED');
    expect(
      transitionSubscription(
        active,
        event({
          kind: 'SUBSCRIPTION_UPDATED',
          subscriptionRef: 'sub',
          state: 'ENDED',
          period,
        }),
        now,
        6,
      ).patch,
    ).toMatchObject({ status: 'EXPIRED', endedAt: now, nextChargeAt: null });
    expect(
      transitionSubscription(
        snapshot(),
        event({ kind: 'CHECKOUT_EXPIRED', checkoutId: 'cs' }),
        now,
        6,
      ).patch.status,
    ).toBe('CHECKOUT_EXPIRED');
  });

  it('ignores events on closed subscriptions', () => {
    const result = transitionSubscription(
      snapshot({ status: SubscriptionStatus.EXPIRED }),
      event({
        kind: 'PAYMENT_SUCCEEDED',
        subscriptionRef: 'sub',
        periodEnd: now,
      }),
      now,
      6,
    );
    expect(result.outcome).toBe('NO_CHANGE');
  });
});

describe('out-of-order delivery', () => {
  const later = new Date('2026-10-07T11:00:00.000Z');
  const applied = { ...active, lastProviderEventAt: later };

  it('ignores an older failure delivered after a newer state', () => {
    const result = transitionSubscription(
      applied,
      event({ kind: 'PAYMENT_FAILED', subscriptionRef: 'sub' }),
      now,
      6,
    );
    expect(result).toEqual({ outcome: 'STALE', patch: {} });
  });

  it('never shortens access with an older billing period', () => {
    const result = transitionSubscription(
      active,
      event({
        kind: 'SUBSCRIPTION_UPDATED',
        subscriptionRef: 'sub',
        state: 'ACTIVE',
        occurredAt: later,
        period: {
          currentPeriodStart: new Date('2026-09-07T10:00:00.000Z'),
          currentPeriodEnd: new Date('2026-10-07T10:00:00.000Z'),
          cancelAtPeriodEnd: false,
        },
      }),
      now,
      6,
    );
    expect(result.patch.entitlementEndAt).toBeUndefined();
    expect(result.patch.lastProviderEventAt).toEqual(later);
  });

  it('still activates a pending checkout from an older payment event', () => {
    const result = transitionSubscription(
      snapshot({ lastProviderEventAt: later }),
      event({
        kind: 'PAYMENT_SUCCEEDED',
        subscriptionRef: 'sub',
        periodEnd: null,
      }),
      now,
      6,
    );
    expect(result.outcome).toBe('ACTIVATED');
    expect(result.patch.lastProviderEventAt).toBeUndefined();
  });

  it('dates the grace period from the provider event, not from delivery', () => {
    const result = transitionSubscription(
      active,
      event({
        kind: 'PAYMENT_FAILED',
        subscriptionRef: 'sub',
        occurredAt: new Date('2026-10-05T10:00:00.000Z'),
      }),
      now,
      6,
    );
    expect(result.patch.graceEndsAt).toEqual(
      new Date('2026-10-11T10:00:00.000Z'),
    );
  });
});

describe('hasEntitlement', () => {
  it('grants access while active or within grace, never when paused', () => {
    const later = new Date('2026-10-20T00:00:00.000Z');
    expect(hasEntitlement(active, now)).toBe(true);
    expect(hasEntitlement(active, new Date('2026-11-08T00:00:00.000Z'))).toBe(
      false,
    );
    const grace = {
      status: SubscriptionStatus.PAYMENT_GRACE,
      entitlementEndAt: now,
      graceEndsAt: new Date('2026-10-13T10:00:00.000Z'),
    };
    expect(hasEntitlement(grace, now)).toBe(true);
    expect(hasEntitlement(grace, later)).toBe(false);
    expect(
      hasEntitlement({ ...grace, status: SubscriptionStatus.PAUSED }, now),
    ).toBe(false);
  });
});
