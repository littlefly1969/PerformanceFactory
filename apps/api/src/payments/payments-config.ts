import { PaymentProviderKind } from '@prisma/client';

type Env = Record<string, string | undefined>;

function positiveNumber(value: string | undefined, fallback: number) {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Grace period dopo un rinnovo fallito (A5.8): 6 giorni salvo diversa configurazione. */
export function paymentGraceDays(env: Env = process.env) {
  return positiveNumber(env.PAYMENTS_GRACE_DAYS, 6);
}

/** Disdetta accettata fino al giorno precedente la scadenza (A5.5). */
export function cancelNoticeHours(env: Env = process.env) {
  return positiveNumber(env.PAYMENTS_CANCEL_NOTICE_HOURS, 24);
}

function webOrigin(env: Env) {
  const first = (env.WEB_ORIGIN ?? 'http://127.0.0.1:3000')
    .split(',')
    .map((item) => item.trim())
    .find(Boolean);
  return (first ?? 'http://127.0.0.1:3000').replace(/\/+$/, '');
}

export function checkoutReturnUrls(env: Env = process.env) {
  const origin = webOrigin(env);
  return {
    successUrl:
      env.PAYMENTS_SUCCESS_URL || `${origin}/abbonamento?checkout=success`,
    cancelUrl:
      env.PAYMENTS_CANCEL_URL || `${origin}/abbonamento?checkout=cancel`,
  };
}

const PROVIDER_BY_NAME: Record<string, PaymentProviderKind> = {
  stub: PaymentProviderKind.STUB,
  stripe: PaymentProviderKind.STRIPE,
};

export function providerKindFromName(name: string | undefined) {
  return name ? PROVIDER_BY_NAME[name.trim().toLowerCase()] : undefined;
}

/** Provider usato per i nuovi checkout. Lo stub non e mai ammesso in produzione. */
export function selectedProviderKind(env: Env = process.env) {
  const isProduction = env.NODE_ENV === 'production';
  const configured = env.PAYMENTS_PROVIDER;
  if (!configured) {
    if (isProduction) {
      throw new Error('PAYMENTS_PROVIDER e obbligatorio in produzione');
    }
    return PaymentProviderKind.STUB;
  }
  const kind = providerKindFromName(configured);
  if (!kind) {
    throw new Error(`PAYMENTS_PROVIDER non supportato: ${configured}`);
  }
  assertProviderAllowed(kind, env);
  return kind;
}

export function assertProviderAllowed(
  kind: PaymentProviderKind,
  env: Env = process.env,
) {
  if (kind === PaymentProviderKind.STUB && env.NODE_ENV === 'production') {
    throw new Error(
      'Il provider di pagamento stub non e ammesso in produzione',
    );
  }
}

/** Solo chiavi di test finche non si decide esplicitamente di andare live. */
export function stripeSecretKey(env: Env = process.env) {
  const key = env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error(
      'STRIPE_SECRET_KEY e obbligatoria per PAYMENTS_PROVIDER=stripe',
    );
  }
  const isLive = /^(sk|rk)_live_/.test(key);
  if (isLive && env.STRIPE_ALLOW_LIVE_KEYS !== 'true') {
    throw new Error(
      'Chiave Stripe live rifiutata: usare una chiave di test o impostare STRIPE_ALLOW_LIVE_KEYS=true',
    );
  }
  return key;
}

export function stripeWebhookSecret(env: Env = process.env) {
  const secret = env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error(
      'STRIPE_WEBHOOK_SECRET e obbligatoria per i webhook Stripe',
    );
  }
  return secret;
}

/** Durata del checkout ospitato: Stripe accetta tra 30 minuti e 24 ore. */
export function checkoutTtlMinutes(env: Env = process.env) {
  return Math.min(
    1440,
    Math.max(30, positiveNumber(env.PAYMENTS_CHECKOUT_TTL_MINUTES, 30)),
  );
}
