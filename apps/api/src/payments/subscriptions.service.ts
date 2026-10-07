import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingCycle,
  PaymentProviderKind,
  ProgramHorizon,
  Subscription,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingCatalogService } from './billing-catalog.service';
import { cancelNoticeHours, checkoutReturnUrls } from './payments-config';
import { PaymentProviderRegistry } from './providers/payment-provider.registry';
import { hasEntitlement } from './subscription-transitions';

const LIVE_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAYMENT_GRACE,
  SubscriptionStatus.PAUSED,
];

export type CheckoutUser = { id: string; email: string };

function view(subscription: Subscription) {
  return {
    id: subscription.id,
    status: subscription.status,
    horizon: subscription.horizon,
    billingCycle: subscription.billingCycle,
    provider: subscription.provider,
    purchaseChannel: subscription.purchaseChannel,
    amountCents: subscription.amountCents,
    currency: subscription.currency,
    currentPeriodStart: subscription.currentPeriodStart,
    entitlementEndAt: subscription.entitlementEndAt,
    nextChargeAt: subscription.nextChargeAt,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    graceEndsAt: subscription.graceEndsAt,
    programStartedAt: subscription.programStartedAt,
    programEndsAt: subscription.programEndsAt,
  };
}

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: BillingCatalogService,
    private readonly providers: PaymentProviderRegistry,
  ) {}

  /** Nessun addebito senza conferma esplicita: si crea solo un checkout ospitato (A4.9). */
  async startCheckout(
    user: CheckoutUser,
    horizon: ProgramHorizon,
    billingCycle: BillingCycle,
  ) {
    const offer = await this.catalog.resolveOffer(horizon, billingCycle);
    const live = await this.liveSubscription(user.id);
    const blocking =
      live &&
      (live.status === SubscriptionStatus.PAUSED ||
        hasEntitlement(live, new Date()));
    if (blocking) {
      throw new ConflictException('Esiste gia un abbonamento attivo');
    }

    const provider = this.providers.current();
    const subscription = await this.prisma.subscription.create({
      data: {
        userId: user.id,
        horizon,
        billingCycle,
        provider: provider.kind,
        amountCents: offer.amountCents,
        currency: offer.currency,
      },
    });
    const customer = await this.prisma.paymentCustomer.findUnique({
      where: { userId_provider: { userId: user.id, provider: provider.kind } },
    });
    const checkout = await provider.createCheckout({
      subscriptionId: subscription.id,
      userId: user.id,
      email: user.email,
      horizon,
      billingCycle,
      billingMonths: offer.billingMonths,
      amountCents: offer.amountCents,
      currency: offer.currency,
      customerId: customer?.providerCustomerId ?? null,
      ...checkoutReturnUrls(),
    });
    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { providerCheckoutId: checkout.checkoutId },
    });
    return {
      subscriptionId: subscription.id,
      provider: provider.kind,
      checkoutUrl: checkout.url,
    };
  }

  async status(userId: string) {
    const now = new Date();
    const subscription = await this.liveSubscription(userId);
    return {
      entitled: subscription ? hasEntitlement(subscription, now) : false,
      subscription: subscription ? view(subscription) : null,
    };
  }

  async hasActiveEntitlement(userId: string) {
    return (await this.status(userId)).entitled;
  }

  /** Disdetta a fine periodo (A5.5) o sua revoca: l'accesso resta fino a entitlementEndAt. */
  async setCancelAtPeriodEnd(
    userId: string,
    cancel: boolean,
    now = new Date(),
  ) {
    const subscription = await this.liveSubscription(userId);
    if (!subscription || !hasEntitlement(subscription, now)) {
      throw new NotFoundException('Nessun abbonamento attivo');
    }
    if (subscription.cancelAtPeriodEnd === cancel) {
      return view(subscription);
    }
    if (cancel && subscription.entitlementEndAt) {
      const deadline =
        subscription.entitlementEndAt.getTime() -
        cancelNoticeHours() * 60 * 60 * 1000;
      if (now.getTime() > deadline) {
        throw new ConflictException(
          'La disdetta va richiesta entro il giorno precedente la scadenza',
        );
      }
    }
    if (subscription.providerSubscriptionId) {
      await this.providers
        .get(subscription.provider)
        .setCancelAtPeriodEnd(subscription.providerSubscriptionId, cancel);
    } else if (subscription.provider !== PaymentProviderKind.STUB) {
      throw new BadRequestException(
        'Abbonamento non ancora collegato al provider di pagamento',
      );
    }
    const updated = await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        cancelAtPeriodEnd: cancel,
        nextChargeAt: cancel ? null : subscription.entitlementEndAt,
      },
    });
    return view(updated);
  }

  private liveSubscription(userId: string) {
    return this.prisma.subscription.findFirst({
      where: { userId, status: { in: LIVE_STATUSES } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
