import {
  checkoutReturnUrls,
  paymentGraceDays,
  selectedProviderKind,
  stripeSecretKey,
} from './payments-config';

describe('payments config', () => {
  it('defaults to the stub provider outside production only', () => {
    expect(selectedProviderKind({ NODE_ENV: 'development' })).toBe('STUB');
    expect(() => selectedProviderKind({ NODE_ENV: 'production' })).toThrow(
      'PAYMENTS_PROVIDER e obbligatorio in produzione',
    );
    expect(() =>
      selectedProviderKind({
        NODE_ENV: 'production',
        PAYMENTS_PROVIDER: 'stub',
      }),
    ).toThrow('non e ammesso in produzione');
    expect(selectedProviderKind({ PAYMENTS_PROVIDER: 'Stripe' })).toBe(
      'STRIPE',
    );
    expect(() => selectedProviderKind({ PAYMENTS_PROVIDER: 'paypal' })).toThrow(
      'PAYMENTS_PROVIDER non supportato',
    );
  });

  it('accepts Stripe test keys and refuses live keys unless explicitly allowed', () => {
    expect(stripeSecretKey({ STRIPE_SECRET_KEY: 'sk_test_123' })).toBe(
      'sk_test_123',
    );
    expect(() => stripeSecretKey({ STRIPE_SECRET_KEY: 'sk_live_123' })).toThrow(
      'Chiave Stripe live rifiutata',
    );
    expect(
      stripeSecretKey({
        STRIPE_SECRET_KEY: 'sk_live_123',
        STRIPE_ALLOW_LIVE_KEYS: 'true',
      }),
    ).toBe('sk_live_123');
    expect(() => stripeSecretKey({})).toThrow('STRIPE_SECRET_KEY');
  });

  it('reads grace days and return URLs from the environment', () => {
    expect(paymentGraceDays({})).toBe(6);
    expect(paymentGraceDays({ PAYMENTS_GRACE_DAYS: '3' })).toBe(3);
    expect(
      checkoutReturnUrls({ WEB_ORIGIN: 'https://pf.example/, https://b' }),
    ).toEqual({
      successUrl: 'https://pf.example/abbonamento?checkout=success',
      cancelUrl: 'https://pf.example/abbonamento?checkout=cancel',
    });
  });
});
