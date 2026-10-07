import { InvalidWebhookError } from './payment-provider';
import {
  signStubPayload,
  STUB_SIGNATURE_HEADER,
  StubPaymentProvider,
} from './stub-payment.provider';

const body = Buffer.from(
  JSON.stringify({
    id: 'evt_1',
    type: 'SUBSCRIPTION_UPDATED',
    data: {
      subscriptionRef: 'stub_sub_1',
      state: 'ACTIVE',
      currentPeriodEnd: '2026-11-07T10:00:00.000Z',
      cancelAtPeriodEnd: true,
    },
  }),
);

describe('StubPaymentProvider', () => {
  it('creates a checkout pointing back to the success URL', async () => {
    const result = await new StubPaymentProvider({}).createCheckout({
      successUrl: 'https://pf.example/abbonamento?checkout=success',
    } as never);
    expect(result.url).toBe(
      `https://pf.example/abbonamento?checkout=success&stub_checkout=${result.checkoutId}`,
    );
  });

  it('verifies the HMAC signature when a secret is configured', async () => {
    const provider = new StubPaymentProvider({
      PAYMENTS_STUB_WEBHOOK_SECRET: 's3cret',
    });
    const event = await provider.parseWebhook(body, {
      [STUB_SIGNATURE_HEADER]: signStubPayload(body, 's3cret'),
    });
    expect(event).toMatchObject({
      kind: 'SUBSCRIPTION_UPDATED',
      eventId: 'evt_1',
      subscriptionRef: 'stub_sub_1',
      state: 'ACTIVE',
      period: {
        currentPeriodEnd: new Date('2026-11-07T10:00:00.000Z'),
        cancelAtPeriodEnd: true,
      },
    });
    await expect(
      provider.parseWebhook(body, { [STUB_SIGNATURE_HEADER]: 'bad' }),
    ).rejects.toBeInstanceOf(InvalidWebhookError);
  });

  it('is disabled in production and rejects malformed events', async () => {
    await expect(
      new StubPaymentProvider({ NODE_ENV: 'production' }).parseWebhook(
        body,
        {},
      ),
    ).rejects.toThrow('disabilitato in produzione');
    await expect(
      new StubPaymentProvider({}).parseWebhook(Buffer.from('{"id":"x"}'), {}),
    ).rejects.toThrow('senza id o type');
  });
});
