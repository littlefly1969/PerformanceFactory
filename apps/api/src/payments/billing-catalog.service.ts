import { BadRequestException, Injectable } from '@nestjs/common';
import { BillingCycle, ProgramHorizon } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BILLING_CYCLE_MONTHS, buildPaywallOffers } from './payment-plans';

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
    if (!option?.isActive || !price || price.amountCents <= 0) {
      throw new BadRequestException(
        'Combinazione di orizzonte e cadenza di pagamento non disponibile',
      );
    }
    return {
      horizon,
      billingCycle,
      billingMonths: BILLING_CYCLE_MONTHS[billingCycle],
      amountCents: price.amountCents,
      currency: price.currency,
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

  updateOption(
    horizon: ProgramHorizon,
    billingCycle: BillingCycle,
    isActive: boolean,
  ) {
    return this.prisma.programBillingOption.upsert({
      where: { horizon_billingCycle: { horizon, billingCycle } },
      create: { horizon, billingCycle, isActive },
      update: { isActive },
    });
  }
}
