import { PaymentProviderKind } from '@prisma/client';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  CheckoutRequest,
  CheckoutResult,
  headerValue,
  InvalidWebhookError,
  NormalizedPaymentEvent,
  PaymentProviderAdapter,
  ProviderSubscriptionState,
  WebhookHeaders,
} from './payment-provider';

export const STUB_SIGNATURE_HEADER = 'x-pf-stub-signature';

type Env = Record<string, string | undefined>;
type StubData = Record<string, unknown>;

const STATES: ProviderSubscriptionState[] = [
  'ACTIVE',
  'PAST_DUE',
  'PAUSED',
  'ENDED',
  'INCOMPLETE',
];

export function signStubPayload(rawBody: string | Buffer, secret: string) {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

function text(data: StubData, key: string) {
  const value = data[key];
  return typeof value === 'string' && value ? value : null;
}

function date(data: StubData, key: string) {
  const value = text(data, key);
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new InvalidWebhookError(`Data non valida in ${key}`);
  }
  return parsed;
}

function period(data: StubData) {
  return {
    currentPeriodStart: date(data, 'currentPeriodStart'),
    currentPeriodEnd: date(data, 'currentPeriodEnd'),
    cancelAtPeriodEnd: data.cancelAtPeriodEnd === true,
  };
}

/**
 * Provider finto per sviluppo e test: nessuna rete, nessun addebito.
 * I webhook usano il modello normalizzato firmato con HMAC-SHA256.
 */
export class StubPaymentProvider implements PaymentProviderAdapter {
  readonly kind = PaymentProviderKind.STUB;

  constructor(private readonly env: Env = process.env) {}

  createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    const checkoutId = `stub_cs_${randomUUID()}`;
    const separator = request.successUrl.includes('?') ? '&' : '?';
    return Promise.resolve({
      checkoutId,
      url: `${request.successUrl}${separator}stub_checkout=${checkoutId}`,
    });
  }

  setCancelAtPeriodEnd(): Promise<void> {
    return Promise.resolve();
  }

  expireCheckout(): Promise<'EXPIRED' | 'COMPLETED'> {
    return Promise.resolve('EXPIRED');
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async parseWebhook(
    rawBody: Buffer,
    headers: WebhookHeaders,
  ): Promise<NormalizedPaymentEvent> {
    return this.parse(rawBody, headers);
  }

  private parse(rawBody: Buffer, headers: WebhookHeaders) {
    if (this.env.NODE_ENV === 'production') {
      throw new InvalidWebhookError('Webhook stub disabilitato in produzione');
    }
    const secret = this.env.PAYMENTS_STUB_WEBHOOK_SECRET;
    if (secret) {
      const expected = Buffer.from(signStubPayload(rawBody, secret));
      const received = Buffer.from(
        headerValue(headers, STUB_SIGNATURE_HEADER) ?? '',
      );
      if (
        expected.length !== received.length ||
        !timingSafeEqual(expected, received)
      ) {
        throw new InvalidWebhookError('Firma webhook stub non valida');
      }
    }

    let body: { id?: unknown; type?: unknown; data?: unknown };
    try {
      body = JSON.parse(rawBody.toString('utf8')) as typeof body;
    } catch {
      throw new InvalidWebhookError('Payload webhook stub non valido');
    }
    const eventId = typeof body.id === 'string' ? body.id : '';
    const rawType = typeof body.type === 'string' ? body.type : '';
    const data = (
      body.data && typeof body.data === 'object' ? body.data : {}
    ) as StubData;
    if (!eventId || !rawType) {
      throw new InvalidWebhookError('Evento stub senza id o type');
    }
    const base = {
      eventId,
      rawType,
      payload: body,
      occurredAt: date(data, 'occurredAt') ?? new Date(),
      localSubscriptionId: text(data, 'localSubscriptionId'),
    };

    switch (rawType) {
      case 'CHECKOUT_COMPLETED':
        return {
          ...base,
          kind: rawType,
          checkoutId: this.required(data, 'checkoutId'),
          subscriptionRef: text(data, 'subscriptionRef'),
          customerRef: text(data, 'customerRef'),
          paid: data.paid !== false,
          period: data.currentPeriodEnd ? period(data) : null,
        } satisfies NormalizedPaymentEvent;
      case 'CHECKOUT_EXPIRED':
        return {
          ...base,
          kind: rawType,
          checkoutId: this.required(data, 'checkoutId'),
        } satisfies NormalizedPaymentEvent;
      case 'SUBSCRIPTION_UPDATED': {
        const state = text(data, 'state') as ProviderSubscriptionState | null;
        if (!state || !STATES.includes(state)) {
          throw new InvalidWebhookError('Stato abbonamento stub non valido');
        }
        return {
          ...base,
          kind: rawType,
          subscriptionRef: this.required(data, 'subscriptionRef'),
          state,
          period: period(data),
        } satisfies NormalizedPaymentEvent;
      }
      case 'PAYMENT_SUCCEEDED':
        return {
          ...base,
          kind: rawType,
          subscriptionRef: text(data, 'subscriptionRef'),
          periodEnd: date(data, 'periodEnd'),
        } satisfies NormalizedPaymentEvent;
      case 'PAYMENT_FAILED':
        return {
          ...base,
          kind: rawType,
          subscriptionRef: text(data, 'subscriptionRef'),
        } satisfies NormalizedPaymentEvent;
      default:
        return { ...base, kind: 'IGNORED' } satisfies NormalizedPaymentEvent;
    }
  }

  private required(data: StubData, key: string) {
    const value = text(data, key);
    if (!value) {
      throw new InvalidWebhookError(`Campo obbligatorio mancante: ${key}`);
    }
    return value;
  }
}
