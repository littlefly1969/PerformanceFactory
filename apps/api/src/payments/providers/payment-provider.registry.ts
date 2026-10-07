import { Injectable } from '@nestjs/common';
import { PaymentProviderKind } from '@prisma/client';
import Stripe from 'stripe';
import {
  assertProviderAllowed,
  selectedProviderKind,
  stripeSecretKey,
  stripeWebhookSecret,
} from '../payments-config';
import { PaymentProviderAdapter } from './payment-provider';
import { StripePaymentProvider } from './stripe-payment.provider';
import { StubPaymentProvider } from './stub-payment.provider';

/**
 * Punto unico per aggiungere provider (PayPal diretto, App Store, Google Play):
 * ognuno implementa PaymentProviderAdapter e normalizza i propri eventi.
 * Gli adapter sono creati al primo uso, cosi l'API parte anche senza chiavi.
 */
@Injectable()
export class PaymentProviderRegistry {
  private readonly adapters = new Map<
    PaymentProviderKind,
    PaymentProviderAdapter
  >();

  current() {
    return this.get(selectedProviderKind());
  }

  get(kind: PaymentProviderKind) {
    assertProviderAllowed(kind);
    const cached = this.adapters.get(kind);
    if (cached) {
      return cached;
    }
    const adapter = this.create(kind);
    this.adapters.set(kind, adapter);
    return adapter;
  }

  register(adapter: PaymentProviderAdapter) {
    this.adapters.set(adapter.kind, adapter);
  }

  private create(kind: PaymentProviderKind): PaymentProviderAdapter {
    switch (kind) {
      case PaymentProviderKind.STRIPE:
        return new StripePaymentProvider(new Stripe(stripeSecretKey()), () =>
          stripeWebhookSecret(),
        );
      case PaymentProviderKind.STUB:
        return new StubPaymentProvider();
      default:
        throw new Error(
          `Provider di pagamento non supportato: ${String(kind)}`,
        );
    }
  }
}
