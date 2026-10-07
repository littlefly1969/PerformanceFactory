import { BillingCycle, PaymentProviderKind } from '@prisma/client';
import Stripe from 'stripe';
import {
  CheckoutRequest,
  CheckoutResult,
  headerValue,
  InvalidWebhookError,
  NormalizedPaymentEvent,
  PaymentProviderAdapter,
  ProviderSubscriptionState,
  SubscriptionPeriod,
  WebhookHeaders,
} from './payment-provider';

export const PF_SUBSCRIPTION_METADATA_KEY = 'pfSubscriptionId';

const SUBSCRIPTION_STATES: Record<string, ProviderSubscriptionState> = {
  active: 'ACTIVE',
  trialing: 'ACTIVE',
  past_due: 'PAST_DUE',
  unpaid: 'PAST_DUE',
  paused: 'PAUSED',
  canceled: 'ENDED',
  incomplete_expired: 'ENDED',
  incomplete: 'INCOMPLETE',
};

const SUBSCRIPTION_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
]);

type Ref = string | { id: string } | null | undefined;

function refId(ref: Ref) {
  if (!ref) {
    return null;
  }
  return typeof ref === 'string' ? ref : ref.id;
}

function fromUnix(seconds: number | null | undefined) {
  return typeof seconds === 'number' ? new Date(seconds * 1000) : null;
}

function recurring(cycle: BillingCycle, months: number) {
  return cycle === BillingCycle.ANNUAL
    ? { interval: 'year' as const, interval_count: 1 }
    : { interval: 'month' as const, interval_count: months };
}

/** I periodi stanno sugli item dalle API 2025 in poi; fallback sul livello abbonamento. */
export function stripeSubscriptionPeriod(
  subscription: Stripe.Subscription,
): SubscriptionPeriod {
  const legacy = subscription as unknown as {
    current_period_start?: number;
    current_period_end?: number;
  };
  const item = subscription.items?.data?.[0];
  return {
    currentPeriodStart: fromUnix(
      item?.current_period_start ?? legacy.current_period_start,
    ),
    currentPeriodEnd: fromUnix(
      item?.current_period_end ?? legacy.current_period_end,
    ),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  };
}

function invoiceSubscription(invoice: Stripe.Invoice) {
  const details = invoice.parent?.subscription_details;
  const legacy = invoice as unknown as { subscription?: Ref };
  return {
    subscriptionRef: refId(details?.subscription ?? legacy.subscription),
    localSubscriptionId:
      details?.metadata?.[PF_SUBSCRIPTION_METADATA_KEY] ?? null,
  };
}

/** Stripe Billing + Checkout ospitato. La chiave arriva solo da variabili d'ambiente. */
export class StripePaymentProvider implements PaymentProviderAdapter {
  readonly kind = PaymentProviderKind.STRIPE;

  constructor(
    private readonly stripe: Stripe,
    private readonly webhookSecret: () => string,
  ) {}

  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    const metadata = {
      [PF_SUBSCRIPTION_METADATA_KEY]: request.subscriptionId,
      horizon: request.horizon,
      billingCycle: request.billingCycle,
    };
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        locale: 'it',
        client_reference_id: request.subscriptionId,
        ...(request.customerId
          ? { customer: request.customerId }
          : { customer_email: request.email }),
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: request.currency,
              unit_amount: request.amountCents,
              recurring: recurring(request.billingCycle, request.billingMonths),
              product_data: { name: 'Performance Factory' },
            },
          },
        ],
        metadata,
        subscription_data: { metadata },
        expires_at: Math.floor(request.expiresAt.getTime() / 1000),
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
      },
      { idempotencyKey: `pf-checkout-${request.subscriptionId}` },
    );
    if (!session.url) {
      throw new Error('Stripe non ha restituito un URL di checkout');
    }
    return { checkoutId: session.id, url: session.url };
  }

  async setCancelAtPeriodEnd(subscriptionRef: string, cancel: boolean) {
    await this.stripe.subscriptions.update(subscriptionRef, {
      cancel_at_period_end: cancel,
    });
  }

  async expireCheckout(checkoutId: string) {
    const session = await this.stripe.checkout.sessions.retrieve(checkoutId);
    if (session.status === 'complete') {
      return 'COMPLETED' as const;
    }
    if (session.status === 'open') {
      const expired = await this.stripe.checkout.sessions.expire(checkoutId);
      if (expired.status === 'complete') {
        return 'COMPLETED' as const;
      }
    }
    return 'EXPIRED' as const;
  }

  async parseWebhook(
    rawBody: Buffer,
    headers: WebhookHeaders,
  ): Promise<NormalizedPaymentEvent> {
    const signature = headerValue(headers, 'stripe-signature');
    if (!signature) {
      throw new InvalidWebhookError('Header stripe-signature mancante');
    }
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret(),
      );
    } catch (error) {
      throw new InvalidWebhookError(
        error instanceof Error ? error.message : 'Firma Stripe non valida',
      );
    }
    return this.normalize(event);
  }

  private async normalize(
    event: Stripe.Event,
  ): Promise<NormalizedPaymentEvent> {
    const base = {
      eventId: event.id,
      rawType: event.type,
      payload: event,
      occurredAt: new Date(event.created * 1000),
      localSubscriptionId: null as string | null,
    };

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      if (session.mode !== 'subscription') {
        return { ...base, kind: 'IGNORED' };
      }
      const subscriptionRef = refId(session.subscription);
      const subscription = subscriptionRef
        ? await this.stripe.subscriptions.retrieve(subscriptionRef)
        : null;
      return {
        ...base,
        localSubscriptionId:
          session.metadata?.[PF_SUBSCRIPTION_METADATA_KEY] ??
          session.client_reference_id,
        kind: 'CHECKOUT_COMPLETED',
        checkoutId: session.id,
        subscriptionRef,
        customerRef: refId(session.customer),
        paid: session.payment_status !== 'unpaid',
        period: subscription ? stripeSubscriptionPeriod(subscription) : null,
      };
    }

    if (event.type === 'checkout.session.expired') {
      const session = event.data.object;
      return {
        ...base,
        localSubscriptionId:
          session.metadata?.[PF_SUBSCRIPTION_METADATA_KEY] ?? null,
        kind: 'CHECKOUT_EXPIRED',
        checkoutId: session.id,
      };
    }

    if (SUBSCRIPTION_EVENTS.has(event.type)) {
      const snapshot = event.data.object as Stripe.Subscription;
      // Gli eventi possono arrivare fuori ordine: si legge sempre lo stato corrente.
      const subscription = await this.stripe.subscriptions.retrieve(
        snapshot.id,
      );
      return {
        ...base,
        localSubscriptionId:
          subscription.metadata?.[PF_SUBSCRIPTION_METADATA_KEY] ?? null,
        kind: 'SUBSCRIPTION_UPDATED',
        subscriptionRef: subscription.id,
        state: SUBSCRIPTION_STATES[subscription.status] ?? 'INCOMPLETE',
        period: stripeSubscriptionPeriod(subscription),
      };
    }

    if (event.type === 'invoice.paid') {
      const invoice = event.data.object;
      return {
        ...base,
        ...invoiceSubscription(invoice),
        kind: 'PAYMENT_SUCCEEDED',
        periodEnd: fromUnix(invoice.lines?.data?.[0]?.period?.end),
      };
    }

    if (event.type === 'invoice.payment_failed') {
      return {
        ...base,
        ...invoiceSubscription(event.data.object),
        kind: 'PAYMENT_FAILED',
      };
    }

    return { ...base, kind: 'IGNORED' };
  }
}
