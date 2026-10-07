import Stripe from 'stripe';
import { InvalidWebhookError } from './payment-provider';
import { StripePaymentProvider } from './stripe-payment.provider';

const secret = 'whsec_test_secret';
const periodStart = 1_791_367_200; // 2026-10-07T10:00:00Z
const periodEnd = 1_794_045_600; // 2026-11-07T10:00:00Z

function subscription(status: string, cancelAtPeriodEnd = false) {
  return {
    id: 'sub_123',
    object: 'subscription',
    status,
    cancel_at_period_end: cancelAtPeriodEnd,
    metadata: { pfSubscriptionId: 'pf-sub-1' },
    items: {
      data: [
        { current_period_start: periodStart, current_period_end: periodEnd },
      ],
    },
  } as unknown as Stripe.Subscription;
}

function setup() {
  const stripe = new Stripe('sk_test_fake');
  const retrieve = jest
    .spyOn(stripe.subscriptions, 'retrieve')
    .mockResolvedValue(subscription('active') as never);
  const create = jest
    .spyOn(stripe.checkout.sessions, 'create')
    .mockResolvedValue({
      id: 'cs_test_1',
      url: 'https://checkout.stripe.com/c/cs_test_1',
    } as never);
  const provider = new StripePaymentProvider(stripe, () => secret);
  const sign = (event: object) => {
    const payload = JSON.stringify(event);
    return {
      body: Buffer.from(payload),
      headers: {
        'stripe-signature': stripe.webhooks.generateTestHeaderString({
          payload,
          secret,
        }),
      },
    };
  };
  return { stripe, provider, retrieve, create, sign };
}

function stripeEvent(type: string, object: object) {
  return { id: `evt_${type}`, object: 'event', type, data: { object } };
}

describe('StripePaymentProvider', () => {
  it('creates a hosted subscription checkout from configured price data', async () => {
    const { provider, create } = setup();
    const result = await provider.createCheckout({
      subscriptionId: 'pf-sub-1',
      userId: 'user-1',
      email: 'athlete@example.com',
      horizon: 'PROGRAM_12M',
      billingCycle: 'QUARTERLY',
      billingMonths: 3,
      amountCents: 5000,
      currency: 'eur',
      customerId: null,
      successUrl: 'https://pf.example/ok',
      cancelUrl: 'https://pf.example/ko',
    });
    expect(result).toEqual({
      checkoutId: 'cs_test_1',
      url: 'https://checkout.stripe.com/c/cs_test_1',
    });
    const [params, options] = create.mock.calls[0];
    expect(params).toMatchObject({
      mode: 'subscription',
      client_reference_id: 'pf-sub-1',
      customer_email: 'athlete@example.com',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: 5000,
            recurring: { interval: 'month', interval_count: 3 },
          },
        },
      ],
      subscription_data: {
        metadata: {
          pfSubscriptionId: 'pf-sub-1',
          horizon: 'PROGRAM_12M',
          billingCycle: 'QUARTERLY',
        },
      },
    });
    expect(options).toEqual({ idempotencyKey: 'pf-checkout-pf-sub-1' });
  });

  it('normalizes a signed checkout.session.completed with the subscription period', async () => {
    const { provider, sign } = setup();
    const { body, headers } = sign(
      stripeEvent('checkout.session.completed', {
        id: 'cs_test_1',
        object: 'checkout.session',
        mode: 'subscription',
        payment_status: 'paid',
        subscription: 'sub_123',
        customer: 'cus_123',
        client_reference_id: 'pf-sub-1',
        metadata: { pfSubscriptionId: 'pf-sub-1' },
      }),
    );
    await expect(provider.parseWebhook(body, headers)).resolves.toMatchObject({
      kind: 'CHECKOUT_COMPLETED',
      checkoutId: 'cs_test_1',
      subscriptionRef: 'sub_123',
      customerRef: 'cus_123',
      localSubscriptionId: 'pf-sub-1',
      paid: true,
      period: {
        currentPeriodStart: new Date(periodStart * 1000),
        currentPeriodEnd: new Date(periodEnd * 1000),
        cancelAtPeriodEnd: false,
      },
    });
  });

  it('reads the current subscription state instead of the event snapshot', async () => {
    const { provider, sign, retrieve } = setup();
    retrieve.mockResolvedValueOnce(subscription('past_due', true) as never);
    const { body, headers } = sign(
      stripeEvent('customer.subscription.updated', subscription('active')),
    );
    await expect(provider.parseWebhook(body, headers)).resolves.toMatchObject({
      kind: 'SUBSCRIPTION_UPDATED',
      subscriptionRef: 'sub_123',
      state: 'PAST_DUE',
      localSubscriptionId: 'pf-sub-1',
      period: { cancelAtPeriodEnd: true },
    });
    expect(retrieve).toHaveBeenCalledWith('sub_123');
  });

  it('maps invoice events to payment success and failure', async () => {
    const { provider, sign } = setup();
    const invoice = {
      id: 'in_1',
      object: 'invoice',
      parent: {
        type: 'subscription_details',
        subscription_details: {
          subscription: 'sub_123',
          metadata: { pfSubscriptionId: 'pf-sub-1' },
        },
      },
      lines: { data: [{ period: { start: periodStart, end: periodEnd } }] },
    };
    const paid = sign(stripeEvent('invoice.paid', invoice));
    await expect(
      provider.parseWebhook(paid.body, paid.headers),
    ).resolves.toMatchObject({
      kind: 'PAYMENT_SUCCEEDED',
      subscriptionRef: 'sub_123',
      localSubscriptionId: 'pf-sub-1',
      periodEnd: new Date(periodEnd * 1000),
    });
    const failed = sign(stripeEvent('invoice.payment_failed', invoice));
    await expect(
      provider.parseWebhook(failed.body, failed.headers),
    ).resolves.toMatchObject({
      kind: 'PAYMENT_FAILED',
      subscriptionRef: 'sub_123',
    });
  });

  it('rejects unsigned or tampered payloads', async () => {
    const { provider, sign } = setup();
    const { headers } = sign(stripeEvent('invoice.paid', { id: 'in_1' }));
    await expect(
      provider.parseWebhook(Buffer.from('{"tampered":true}'), headers),
    ).rejects.toBeInstanceOf(InvalidWebhookError);
    await expect(provider.parseWebhook(Buffer.from('{}'), {})).rejects.toThrow(
      'stripe-signature',
    );
  });

  it('ignores event types outside the subscription model', async () => {
    const { provider, sign } = setup();
    const { body, headers } = sign(
      stripeEvent('charge.refunded', { id: 'ch_1' }),
    );
    await expect(provider.parseWebhook(body, headers)).resolves.toMatchObject({
      kind: 'IGNORED',
      rawType: 'charge.refunded',
    });
  });
});
