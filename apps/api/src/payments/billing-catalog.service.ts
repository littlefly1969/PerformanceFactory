import { BadRequestException, Injectable } from '@nestjs/common';
import { BillingCycle, ProgramHorizon } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  BILLING_CYCLE_MONTHS,
  buildPaywallOffers,
  monthlyEquivalentCents,
  resolveAmount,
} from './payment-plans';

/** Prezzi e matrice orizzonte x ciclo letti da database, gestiti da back office. */
@Injectable()
export class BillingCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async offers() {
    const [prices, options] = await Promise.all([
      this.prisma.billingCyclePrice.findMany(),
      this.prisma.programBillingOption.findMany(),
    ]);
    return buildPaywallOffers(prices, options);
  }

  async resolveOffer(horizon: ProgramHorizon, billingCycle: BillingCycle) {
    const [option, price] = await Promise.all([
      this.prisma.programBillingOption.findUnique({
        where: { horizon_billingCycle: { horizon, billingCycle } },
      }),
      this.prisma.billingCyclePrice.findUnique({ where: { billingCycle } }),
    ]);
    const amount = option?.isActive
      ? resolveAmount(option, price ?? undefined)
      : null;
    if (!amount) {
      throw new BadRequestException(
        'Combinazione di orizzonte e cadenza di pagamento non disponibile',
      );
    }
    return {
      horizon,
      billingCycle,
      billingMonths: BILLING_CYCLE_MONTHS[billingCycle],
      amountCents: amount.amountCents,
      monthlyEquivalentCents: monthlyEquivalentCents(
        amount.amountCents,
        billingCycle,
      ),
      currency: amount.currency,
    };
  }

  async adminCatalog() {
    const [prices, options] = await Promise.all([
      this.prisma.billingCyclePrice.findMany({
        orderBy: { billingCycle: 'asc' },
      }),
      this.prisma.programBillingOption.findMany({
        orderBy: [{ horizon: 'asc' }, { billingCycle: 'asc' }],
      }),
    ]);
    return { prices, options };
  }

  updatePrice(
    billingCycle: BillingCycle,
    amountCents: number,
    currency?: string,
  ) {
    const normalizedCurrency = currency?.toLowerCase();
    return this.prisma.billingCyclePrice.upsert({
      where: { billingCycle },
      create: {
        billingCycle,
        amountCents,
        ...(normalizedCurrency ? { currency: normalizedCurrency } : {}),
      },
      update: {
        amountCents,
        ...(normalizedCurrency ? { currency: normalizedCurrency } : {}),
      },
    });
  }

  /**
   * Stato e prezzo della combinazione: `amountCents` a null riporta la
   * combinazione al listino della cadenza.
   */
  updateOption(
    horizon: ProgramHorizon,
    billingCycle: BillingCycle,
    isActive: boolean,
    amountCents?: number | null,
    currency?: string | null,
  ) {
    const price =
      amountCents === undefined
        ? {}
        : {
            amountCents,
            currency:
              amountCents === null ? null : (currency?.toLowerCase() ?? 'eur'),
          };
    return this.prisma.programBillingOption.upsert({
      where: { horizon_billingCycle: { horizon, billingCycle } },
      create: { horizon, billingCycle, isActive, ...price },
      update: { isActive, ...price },
    });
  }
}
