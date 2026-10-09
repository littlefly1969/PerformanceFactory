import {
  BadGatewayException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  BillingCycle,
  Prisma,
  PaymentProviderKind,
  ProgramHorizon,
  Subscription,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingCatalogService } from './billing-catalog.service';
import { checkoutReturnUrls, checkoutTtlMinutes } from './payments-config';
import { PaymentProviderAdapter } from './providers/payment-provider';
import { PaymentProviderRegistry } from './providers/payment-provider.registry';

/** Stati non terminali: l'indice parziale in database ne ammette uno per utente. */
export const OPEN_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.CHECKOUT_PENDING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAYMENT_GRACE,
  SubscriptionStatus.PAUSED,
];

/** Un checkout senza URL dopo questo tempo e una preparazione interrotta. */
const PREPARATION_TIMEOUT_MS = 60_000;
/** Un checkout vicino alla scadenza non viene riproposto. */
const REUSE_MARGIN_MS = 5 * 60_000;
const WAIT_STEP_MS = 200;
const WAIT_ATTEMPTS = 25;

export type CheckoutUser = { id: string; email: string };

type Offer = Awaited<ReturnType<BillingCatalogService['resolveOffer']>>;

type Reservation =
  | { kind: 'CREATED'; subscription: Subscription }
  | { kind: 'REUSE'; subscription: Subscription }
  | { kind: 'INVALIDATE'; subscription: Subscription }
  | { kind: 'WAIT' };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sameOffer(subscription: Subscription, offer: Offer, kind: string) {
  return (
    subscription.provider === kind &&
    subscription.horizon === offer.horizon &&
    subscription.billingCycle === offer.billingCycle &&
    subscription.amountCents === offer.amountCents &&
    subscription.currency === offer.currency
  );
}

/**
 * Il paywall segue il reveal (PF-FS-PREPAYWALL §7.3, #14): si paga solo con
 * il percorso in PAYWALL_READY, quindi dopo aver visto R, P e gap, e solo
 * l'orizzonte scelto nel reveal, mai un'offerta diversa.
 */
async function assertPaywallReady(
  tx: Prisma.TransactionClient,
  userId: string,
  horizon: ProgramHorizon,
) {
  const [calibration, discovery] = await Promise.all([
    tx.athleteCalibration.findUnique({
      where: { userId },
      select: { status: true },
    }),
    tx.athleteDiscovery.findUnique({
      where: { userId },
      select: { programHorizon: true },
    }),
  ]);
  if (calibration?.status !== 'PAYWALL_READY')
    throw new ConflictException(
      'Il percorso si attiva dopo aver visto i tuoi scenari e scelto l’orizzonte',
    );
  if (discovery?.programHorizon !== horizon)
    throw new ConflictException(
      'L’offerta non corrisponde al percorso che hai scelto',
    );
}

/**
 * Creazione del checkout serializzata per utente (advisory lock) e protetta
 * dall'indice parziale "un solo abbonamento non terminale". Un doppio click
 * riceve lo stesso checkout; una scelta diversa invalida quello precedente.
 */
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: BillingCatalogService,
    private readonly providers: PaymentProviderRegistry,
  ) {}

  /** Nessun addebito senza conferma esplicita: si crea solo un checkout ospitato (A4.9). */
  async start(
    user: CheckoutUser,
    horizon: ProgramHorizon,
    billingCycle: BillingCycle,
  ) {
    const offer = await this.catalog.resolveOffer(horizon, billingCycle);
    const provider = this.providers.current();

    for (let attempt = 0; attempt < WAIT_ATTEMPTS; attempt += 1) {
      const reservation = await this.reserve(user.id, provider.kind, offer);
      switch (reservation.kind) {
        case 'REUSE':
          return {
            subscriptionId: reservation.subscription.id,
            provider: reservation.subscription.provider,
            checkoutUrl: reservation.subscription.checkoutUrl as string,
          };
        case 'CREATED':
          return this.open(user, reservation.subscription, offer, provider);
        case 'INVALIDATE':
          await this.invalidate(reservation.subscription);
          break;
        case 'WAIT':
          await sleep(WAIT_STEP_MS);
          break;
      }
    }
    throw new ConflictException(
      'Checkout gia in preparazione, riprova tra qualche secondo',
    );
  }

  private reserve(
    userId: string,
    providerKind: PaymentProviderKind,
    offer: Offer,
    now = new Date(),
  ): Promise<Reservation> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`pf-checkout:${userId}`}, 0))`;
      const open = await tx.subscription.findFirst({
        where: { userId, status: { in: OPEN_SUBSCRIPTION_STATUSES } },
      });

      if (open && open.status !== SubscriptionStatus.CHECKOUT_PENDING) {
        throw new ConflictException('Esiste gia un abbonamento attivo');
      }
      await assertPaywallReady(tx, userId, offer.horizon);
      if (open && !open.checkoutUrl) {
        const preparing =
          now.getTime() - open.createdAt.getTime() < PREPARATION_TIMEOUT_MS;
        if (preparing) {
          return { kind: 'WAIT' };
        }
        // Preparazione interrotta: l'URL non e mai stato consegnato, nessuno puo pagarlo.
        await tx.subscription.update({
          where: { id: open.id },
          data: { status: SubscriptionStatus.CHECKOUT_FAILED },
        });
      } else if (open) {
        const reusable =
          sameOffer(open, offer, providerKind) &&
          !!open.checkoutExpiresAt &&
          open.checkoutExpiresAt.getTime() - now.getTime() > REUSE_MARGIN_MS;
        return { kind: reusable ? 'REUSE' : 'INVALIDATE', subscription: open };
      }

      const subscription = await tx.subscription.create({
        data: {
          userId,
          horizon: offer.horizon,
          billingCycle: offer.billingCycle,
          provider: providerKind,
          amountCents: offer.amountCents,
          currency: offer.currency,
        },
      });
      return { kind: 'CREATED', subscription };
    });
  }

  /** Chiude il checkout precedente presso il provider prima di liberare il posto. */
  private async invalidate(subscription: Subscription) {
    if (subscription.providerCheckoutId) {
      const result = await this.providers
        .get(subscription.provider)
        .expireCheckout(subscription.providerCheckoutId);
      if (result === 'COMPLETED') {
        throw new ConflictException(
          'Il pagamento precedente risulta completato: attendi la conferma',
        );
      }
    }
    await this.prisma.subscription.updateMany({
      where: {
        id: subscription.id,
        status: SubscriptionStatus.CHECKOUT_PENDING,
      },
      data: { status: SubscriptionStatus.CHECKOUT_EXPIRED },
    });
  }

  private async open(
    user: CheckoutUser,
    subscription: Subscription,
    offer: Offer,
    provider: PaymentProviderAdapter,
  ) {
    const expiresAt = new Date(Date.now() + checkoutTtlMinutes() * 60_000);
    try {
      const customer = await this.prisma.paymentCustomer.findUnique({
        where: {
          userId_provider: { userId: user.id, provider: provider.kind },
        },
      });
      const checkout = await provider.createCheckout({
        subscriptionId: subscription.id,
        userId: user.id,
        email: user.email,
        horizon: offer.horizon,
        billingCycle: offer.billingCycle,
        billingMonths: offer.billingMonths,
        amountCents: offer.amountCents,
        currency: offer.currency,
        customerId: customer?.providerCustomerId ?? null,
        expiresAt,
        ...checkoutReturnUrls(),
      });
      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          providerCheckoutId: checkout.checkoutId,
          checkoutUrl: checkout.url,
          checkoutExpiresAt: expiresAt,
        },
      });
      return {
        subscriptionId: subscription.id,
        provider: provider.kind,
        checkoutUrl: checkout.url,
      };
    } catch (error) {
      // Nessun record orfano: il posto si libera e l'utente puo riprovare.
      await this.prisma.subscription.updateMany({
        where: {
          id: subscription.id,
          status: SubscriptionStatus.CHECKOUT_PENDING,
        },
        data: { status: SubscriptionStatus.CHECKOUT_FAILED },
      });
      this.logger.error(
        `Checkout ${subscription.id} non creato presso ${provider.kind}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new BadGatewayException(
        'Il provider di pagamento non e disponibile, riprova',
      );
    }
  }
}
