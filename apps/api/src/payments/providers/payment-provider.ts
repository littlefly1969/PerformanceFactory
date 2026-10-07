import {
  BillingCycle,
  PaymentProviderKind,
  ProgramHorizon,
} from '@prisma/client';

export type CheckoutRequest = {
  subscriptionId: string;
  userId: string;
  email: string;
  horizon: ProgramHorizon;
  billingCycle: BillingCycle;
  billingMonths: number;
  amountCents: number;
  currency: string;
  customerId: string | null;
  successUrl: string;
  cancelUrl: string;
  /** Oltre questa data il checkout non e piu pagabile. */
  expiresAt: Date;
};

export type CheckoutResult = {
  checkoutId: string;
  url: string;
};

export type ProviderSubscriptionState =
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'PAUSED'
  | 'ENDED'
  | 'INCOMPLETE';

export type SubscriptionPeriod = {
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

type EventBase = {
  eventId: string;
  rawType: string;
  payload: unknown;
  /** Momento in cui il provider ha generato l'evento: serve a scartare eventi obsoleti. */
  occurredAt: Date;
  /** Id interno PF trasmesso al provider come metadata, se presente. */
  localSubscriptionId: string | null;
};

/** Eventi normalizzati: ogni provider traduce webhook/receipt in questo modello. */
export type NormalizedPaymentEvent =
  | (EventBase & {
      kind: 'CHECKOUT_COMPLETED';
      checkoutId: string;
      subscriptionRef: string | null;
      customerRef: string | null;
      paid: boolean;
      period: SubscriptionPeriod | null;
    })
  | (EventBase & { kind: 'CHECKOUT_EXPIRED'; checkoutId: string })
  | (EventBase & {
      kind: 'SUBSCRIPTION_UPDATED';
      subscriptionRef: string;
      state: ProviderSubscriptionState;
      period: SubscriptionPeriod;
    })
  | (EventBase & {
      kind: 'PAYMENT_SUCCEEDED';
      subscriptionRef: string | null;
      periodEnd: Date | null;
    })
  | (EventBase & { kind: 'PAYMENT_FAILED'; subscriptionRef: string | null })
  | (EventBase & { kind: 'IGNORED' });

export type WebhookHeaders = Record<string, string | string[] | undefined>;

export interface PaymentProviderAdapter {
  readonly kind: PaymentProviderKind;
  createCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
  setCancelAtPeriodEnd(subscriptionRef: string, cancel: boolean): Promise<void>;
  /**
   * Chiude un checkout ancora aperto. Restituisce COMPLETED se nel frattempo e
   * stato pagato: in quel caso non va invalidato.
   */
  expireCheckout(checkoutId: string): Promise<'EXPIRED' | 'COMPLETED'>;
  /** Verifica la firma e normalizza l'evento. Lancia se la firma non e valida. */
  parseWebhook(
    rawBody: Buffer,
    headers: WebhookHeaders,
  ): Promise<NormalizedPaymentEvent>;
}

export class InvalidWebhookError extends Error {}

export function headerValue(headers: WebhookHeaders, name: string) {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}
