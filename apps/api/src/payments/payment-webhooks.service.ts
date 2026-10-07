import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PaymentProviderKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paymentGraceDays, providerKindFromName } from './payments-config';
import {
  InvalidWebhookError,
  NormalizedPaymentEvent,
  WebhookHeaders,
} from './providers/payment-provider';
import { PaymentProviderRegistry } from './providers/payment-provider.registry';
import { transitionSubscription } from './subscription-transitions';

type Tx = Prisma.TransactionClient;

function isUniqueViolation(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

/**
 * Riceve i webhook di qualsiasi provider e li applica al modello subscription PF.
 * Ogni evento e registrato una sola volta (idempotenza) nella stessa transazione
 * dell'aggiornamento: se l'applicazione fallisce, il provider lo ritentera.
 */
@Injectable()
export class PaymentWebhooksService {
  private readonly logger = new Logger(PaymentWebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: PaymentProviderRegistry,
  ) {}

  async handle(
    providerName: string,
    rawBody: Buffer | undefined,
    headers: WebhookHeaders,
  ) {
    const kind = providerKindFromName(providerName);
    if (!kind) {
      throw new BadRequestException('Provider di pagamento sconosciuto');
    }
    if (!rawBody?.length) {
      throw new BadRequestException('Corpo del webhook mancante');
    }
    let event: NormalizedPaymentEvent;
    try {
      event = await this.providers.get(kind).parseWebhook(rawBody, headers);
    } catch (error) {
      if (error instanceof InvalidWebhookError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
    return this.apply(kind, event);
  }

  async apply(
    provider: PaymentProviderKind,
    event: NormalizedPaymentEvent,
    now = new Date(),
  ) {
    const seen = await this.prisma.paymentEvent.findUnique({
      where: {
        provider_providerEventId: { provider, providerEventId: event.eventId },
      },
      select: { id: true },
    });
    if (seen) {
      return { received: true, duplicate: true };
    }
    try {
      const outcome = await this.prisma.$transaction((tx) =>
        this.applyInTransaction(tx, provider, event, now),
      );
      return { received: true, duplicate: false, outcome };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const raced = await this.prisma.paymentEvent.findUnique({
          where: {
            provider_providerEventId: {
              provider,
              providerEventId: event.eventId,
            },
          },
          select: { id: true },
        });
        if (raced) {
          return { received: true, duplicate: true };
        }
      }
      throw error;
    }
  }

  private async applyInTransaction(
    tx: Tx,
    provider: PaymentProviderKind,
    event: NormalizedPaymentEvent,
    now: Date,
  ) {
    const record = await tx.paymentEvent.create({
      data: {
        provider,
        providerEventId: event.eventId,
        type: event.rawType,
        providerCreatedAt: event.occurredAt,
        payloadJson: (event.payload ?? {}) as Prisma.InputJsonValue,
      },
    });
    const target = await this.findTarget(tx, provider, event);
    // Lock di riga: eventi diversi sullo stesso abbonamento sono applicati uno alla volta,
    // sempre sullo stato appena riletto.
    const subscription = target
      ? await this.lockSubscription(tx, target.id)
      : null;
    if (!subscription) {
      if (event.kind !== 'IGNORED') {
        this.logger.warn(
          `Evento ${event.rawType} (${event.eventId}) senza abbonamento PF collegato`,
        );
      }
      return 'NO_CHANGE';
    }

    const transition = transitionSubscription(
      subscription,
      event,
      now,
      paymentGraceDays(),
    );
    const subscriptionRef =
      'subscriptionRef' in event ? event.subscriptionRef : null;
    const customerRef =
      event.kind === 'CHECKOUT_COMPLETED' ? event.customerRef : null;
    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        ...transition.patch,
        ...(subscriptionRef && !subscription.providerSubscriptionId
          ? { providerSubscriptionId: subscriptionRef }
          : {}),
        ...(customerRef ? { providerCustomerId: customerRef } : {}),
      },
    });
    if (customerRef) {
      await tx.paymentCustomer.upsert({
        where: {
          userId_provider: { userId: subscription.userId, provider },
        },
        create: {
          userId: subscription.userId,
          provider,
          providerCustomerId: customerRef,
        },
        update: { providerCustomerId: customerRef },
      });
    }
    await tx.paymentEvent.update({
      where: { id: record.id },
      data: { subscriptionId: subscription.id, outcome: transition.outcome },
    });
    return transition.outcome;
  }

  private async lockSubscription(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT "id" FROM "Subscription" WHERE "id" = ${id} FOR UPDATE`;
    return tx.subscription.findUnique({ where: { id } });
  }

  private async findTarget(
    tx: Tx,
    provider: PaymentProviderKind,
    event: NormalizedPaymentEvent,
  ) {
    if (
      event.kind === 'CHECKOUT_COMPLETED' ||
      event.kind === 'CHECKOUT_EXPIRED'
    ) {
      const byCheckout = await tx.subscription.findUnique({
        where: {
          provider_providerCheckoutId: {
            provider,
            providerCheckoutId: event.checkoutId,
          },
        },
      });
      if (byCheckout) {
        return byCheckout;
      }
    } else if ('subscriptionRef' in event && event.subscriptionRef) {
      const byRef = await tx.subscription.findUnique({
        where: {
          provider_providerSubscriptionId: {
            provider,
            providerSubscriptionId: event.subscriptionRef,
          },
        },
      });
      if (byRef) {
        return byRef;
      }
    }
    if (!event.localSubscriptionId) {
      return null;
    }
    // Fallback per eventi arrivati prima del collegamento (ordine non garantito).
    return tx.subscription.findFirst({
      where: { id: event.localSubscriptionId, provider },
    });
  }
}
