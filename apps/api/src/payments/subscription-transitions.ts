import {
  BillingCycle,
  ProgramHorizon,
  SubscriptionStatus,
} from '@prisma/client';
import {
  addDays,
  addMonths,
  BILLING_CYCLE_MONTHS,
  PROGRAM_HORIZON_MONTHS,
} from './payment-plans';
import {
  NormalizedPaymentEvent,
  SubscriptionPeriod,
} from './providers/payment-provider';

export type SubscriptionSnapshot = {
  status: SubscriptionStatus;
  horizon: ProgramHorizon;
  billingCycle: BillingCycle;
  entitlementEndAt: Date | null;
  graceEndsAt: Date | null;
  programStartedAt: Date | null;
  programEndsAt: Date | null;
};

export type SubscriptionPatch = {
  status?: SubscriptionStatus;
  currentPeriodStart?: Date | null;
  entitlementEndAt?: Date | null;
  nextChargeAt?: Date | null;
  cancelAtPeriodEnd?: boolean;
  graceEndsAt?: Date | null;
  programStartedAt?: Date;
  programEndsAt?: Date;
  endedAt?: Date;
};

export type TransitionOutcome =
  | 'ACTIVATED'
  | 'RENEWED'
  | 'UPDATED'
  | 'PAYMENT_RECOVERED'
  | 'PAYMENT_GRACE_STARTED'
  | 'PAUSED'
  | 'RESUMED'
  | 'EXPIRED'
  | 'CHECKOUT_EXPIRED'
  | 'NO_CHANGE';

export type Transition = {
  outcome: TransitionOutcome;
  patch: SubscriptionPatch;
};

const NO_CHANGE: Transition = { outcome: 'NO_CHANGE', patch: {} };
const CLOSED: SubscriptionStatus[] = [
  SubscriptionStatus.EXPIRED,
  SubscriptionStatus.CHECKOUT_EXPIRED,
];

function periodPatch(period: SubscriptionPeriod): SubscriptionPatch {
  if (!period.currentPeriodEnd) {
    return { cancelAtPeriodEnd: period.cancelAtPeriodEnd };
  }
  return {
    currentPeriodStart: period.currentPeriodStart,
    entitlementEndAt: period.currentPeriodEnd,
    cancelAtPeriodEnd: period.cancelAtPeriodEnd,
    nextChargeAt: period.cancelAtPeriodEnd ? null : period.currentPeriodEnd,
  };
}

/** L'orizzonte sportivo parte alla prima attivazione e non si sposta con i rinnovi. */
function activation(
  current: SubscriptionSnapshot,
  now: Date,
  period: SubscriptionPeriod | null,
): Transition {
  const programStartedAt = current.programStartedAt ?? now;
  const entitlementEndAt =
    period?.currentPeriodEnd ??
    addMonths(now, BILLING_CYCLE_MONTHS[current.billingCycle]);
  const cancelAtPeriodEnd = period?.cancelAtPeriodEnd ?? false;
  return {
    outcome: 'ACTIVATED',
    patch: {
      status: SubscriptionStatus.ACTIVE,
      programStartedAt,
      programEndsAt:
        current.programEndsAt ??
        addMonths(programStartedAt, PROGRAM_HORIZON_MONTHS[current.horizon]),
      currentPeriodStart: period?.currentPeriodStart ?? now,
      entitlementEndAt,
      cancelAtPeriodEnd,
      nextChargeAt: cancelAtPeriodEnd ? null : entitlementEndAt,
      graceEndsAt: null,
    },
  };
}

function startGrace(
  current: SubscriptionSnapshot,
  now: Date,
  graceDays: number,
): Transition {
  if (current.status !== SubscriptionStatus.ACTIVE) {
    return NO_CHANGE;
  }
  return {
    outcome: 'PAYMENT_GRACE_STARTED',
    patch: {
      status: SubscriptionStatus.PAYMENT_GRACE,
      graceEndsAt: addDays(now, graceDays),
    },
  };
}

function onSubscriptionUpdated(
  current: SubscriptionSnapshot,
  event: Extract<NormalizedPaymentEvent, { kind: 'SUBSCRIPTION_UPDATED' }>,
  now: Date,
  graceDays: number,
): Transition {
  const { state, period } = event;
  if (state === 'ENDED') {
    if (current.status === SubscriptionStatus.CHECKOUT_PENDING) {
      return {
        outcome: 'CHECKOUT_EXPIRED',
        patch: { status: SubscriptionStatus.CHECKOUT_EXPIRED },
      };
    }
    return {
      outcome: 'EXPIRED',
      patch: {
        status: SubscriptionStatus.EXPIRED,
        endedAt: now,
        nextChargeAt: null,
        graceEndsAt: null,
        cancelAtPeriodEnd: period.cancelAtPeriodEnd,
      },
    };
  }
  if (state === 'INCOMPLETE') {
    return NO_CHANGE;
  }
  if (state === 'PAST_DUE') {
    const grace = startGrace(current, now, graceDays);
    return {
      outcome: grace.outcome,
      patch: { ...periodPatch(period), ...grace.patch },
    };
  }
  if (state === 'PAUSED') {
    if (current.status === SubscriptionStatus.CHECKOUT_PENDING) {
      return NO_CHANGE;
    }
    return {
      outcome:
        current.status === SubscriptionStatus.PAUSED ? 'UPDATED' : 'PAUSED',
      patch: {
        ...periodPatch(period),
        status: SubscriptionStatus.PAUSED,
        nextChargeAt: null,
        graceEndsAt: null,
      },
    };
  }

  // state === 'ACTIVE'
  switch (current.status) {
    case SubscriptionStatus.CHECKOUT_PENDING:
      return activation(current, now, period);
    case SubscriptionStatus.PAYMENT_GRACE:
      return {
        outcome: 'PAYMENT_RECOVERED',
        patch: {
          ...periodPatch(period),
          status: SubscriptionStatus.ACTIVE,
          graceEndsAt: null,
        },
      };
    case SubscriptionStatus.PAUSED:
      return {
        outcome: 'RESUMED',
        patch: { ...periodPatch(period), status: SubscriptionStatus.ACTIVE },
      };
    default: {
      const renewed =
        !!period.currentPeriodEnd &&
        !!current.entitlementEndAt &&
        period.currentPeriodEnd > current.entitlementEndAt;
      return {
        outcome: renewed ? 'RENEWED' : 'UPDATED',
        patch: periodPatch(period),
      };
    }
  }
}

function onPaymentSucceeded(
  current: SubscriptionSnapshot,
  periodEnd: Date | null,
  now: Date,
): Transition {
  if (current.status === SubscriptionStatus.CHECKOUT_PENDING) {
    return activation(current, now, {
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    });
  }
  const extends_ =
    !!periodEnd &&
    (!current.entitlementEndAt || periodEnd > current.entitlementEndAt);
  const extension: SubscriptionPatch = extends_
    ? { entitlementEndAt: periodEnd, nextChargeAt: periodEnd }
    : {};
  if (current.status === SubscriptionStatus.PAYMENT_GRACE) {
    return {
      outcome: 'PAYMENT_RECOVERED',
      patch: {
        ...extension,
        status: SubscriptionStatus.ACTIVE,
        graceEndsAt: null,
      },
    };
  }
  if (current.status === SubscriptionStatus.ACTIVE && extends_) {
    return { outcome: 'RENEWED', patch: extension };
  }
  return NO_CHANGE;
}

/** Applica un evento normalizzato allo stato PF. Funzione pura, senza I/O. */
export function transitionSubscription(
  current: SubscriptionSnapshot,
  event: NormalizedPaymentEvent,
  now: Date,
  graceDays: number,
): Transition {
  if (CLOSED.includes(current.status)) {
    return NO_CHANGE;
  }
  switch (event.kind) {
    case 'CHECKOUT_COMPLETED':
      return current.status === SubscriptionStatus.CHECKOUT_PENDING &&
        event.paid
        ? activation(current, now, event.period)
        : NO_CHANGE;
    case 'CHECKOUT_EXPIRED':
      return current.status === SubscriptionStatus.CHECKOUT_PENDING
        ? {
            outcome: 'CHECKOUT_EXPIRED',
            patch: { status: SubscriptionStatus.CHECKOUT_EXPIRED },
          }
        : NO_CHANGE;
    case 'SUBSCRIPTION_UPDATED':
      return onSubscriptionUpdated(current, event, now, graceDays);
    case 'PAYMENT_SUCCEEDED':
      return onPaymentSucceeded(current, event.periodEnd, now);
    case 'PAYMENT_FAILED':
      return startGrace(current, now, graceDays);
    default:
      return NO_CHANGE;
  }
}

export type EntitlementInput = {
  status: SubscriptionStatus;
  entitlementEndAt: Date | null;
  graceEndsAt: Date | null;
};

/** Entitlement funzionale unico (A4/A5): sblocca piano, coaching e calendario. */
export function hasEntitlement(subscription: EntitlementInput, now: Date) {
  if (subscription.status === SubscriptionStatus.ACTIVE) {
    return (
      !subscription.entitlementEndAt || subscription.entitlementEndAt > now
    );
  }
  if (subscription.status === SubscriptionStatus.PAYMENT_GRACE) {
    return !!subscription.graceEndsAt && subscription.graceEndsAt > now;
  }
  return false;
}
