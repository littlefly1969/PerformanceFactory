import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentProviderKind,
  Subscription,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { cancelNoticeHours } from './payments-config';
import { PaymentProviderRegistry } from './providers/payment-provider.registry';
import { hasEntitlement } from './subscription-transitions';

const LIVE_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAYMENT_GRACE,
  SubscriptionStatus.PAUSED,
];

export type AccountSubscriptionState =
  | 'NONE'
  | 'PENDING'
  | 'ACTIVE'
  | 'GRACE'
  | 'PAUSED'
  | 'ENDED';

/** Stato mostrato nell'account per ogni stato del contratto. */
const ACCOUNT_STATE: Record<SubscriptionStatus, AccountSubscriptionState> = {
  ACTIVE: 'ACTIVE',
  PAYMENT_GRACE: 'GRACE',
  PAUSED: 'PAUSED',
  CHECKOUT_PENDING: 'PENDING',
  CHECKOUT_EXPIRED: 'NONE',
  CHECKOUT_FAILED: 'NONE',
  EXPIRED: 'ENDED',
};

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
    private readonly providers: PaymentProviderRegistry,
  ) {}

  async status(userId: string) {
    const now = new Date();
    const subscription = await this.liveSubscription(userId);
    return {
      entitled: subscription ? hasEntitlement(subscription, now) : false,
      subscription: subscription ? view(subscription) : null,
    };
  }

  /**
   * Vista per la pagina account: oltre all'abbonamento in corso mostra un
   * pagamento non ancora confermato o l'ultimo contratto terminato. Non
   * cambia `entitled`, che resta quello di status() per checkout e programma.
   */
  async account(userId: string, now = new Date()) {
    const live = await this.liveSubscription(userId);
    if (live) {
      const entitled = hasEntitlement(live, now);
      const deadline = live.entitlementEndAt
        ? new Date(
            live.entitlementEndAt.getTime() -
              cancelNoticeHours() * 60 * 60 * 1000,
          )
        : null;
      const linked =
        !!live.providerSubscriptionId ||
        live.provider === PaymentProviderKind.STUB;
      return {
        state: ACCOUNT_STATE[live.status],
        entitled,
        subscription: view(live),
        cancelDeadline: deadline,
        canCancel:
          entitled &&
          linked &&
          !live.cancelAtPeriodEnd &&
          (!deadline || now <= deadline),
        canResume: entitled && linked && live.cancelAtPeriodEnd,
      };
    }
    const pending = await this.prisma.subscription.findFirst({
      where: {
        userId,
        status: SubscriptionStatus.CHECKOUT_PENDING,
        checkoutExpiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });
    const ended = pending
      ? null
      : await this.prisma.subscription.findFirst({
          where: { userId, status: SubscriptionStatus.EXPIRED },
          orderBy: [{ endedAt: 'desc' }, { createdAt: 'desc' }],
        });
    const shown = pending ?? ended;
    const state: AccountSubscriptionState = pending
      ? 'PENDING'
      : ended
        ? 'ENDED'
        : 'NONE';
    return {
      state,
      entitled: false,
      subscription: shown ? { ...view(shown), endedAt: shown.endedAt } : null,
      cancelDeadline: null,
      canCancel: false,
      canResume: false,
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
