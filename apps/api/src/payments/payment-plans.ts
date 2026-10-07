import { BillingCycle, ProgramHorizon } from '@prisma/client';

// Blueprint A5: l'orizzonte sportivo e la cadenza di pagamento sono indipendenti.
export const PROGRAM_HORIZON_MONTHS: Record<ProgramHorizon, number> = {
  PROGRAM_3M: 3,
  PROGRAM_6M: 6,
  PROGRAM_12M: 12,
};

export const PROGRAM_HORIZON_POTENTIAL: Record<ProgramHorizon, string> = {
  PROGRAM_3M: 'P3',
  PROGRAM_6M: 'P6',
  PROGRAM_12M: 'P12',
};

export const BILLING_CYCLE_MONTHS: Record<BillingCycle, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  ANNUAL: 12,
};

const HORIZON_ORDER: ProgramHorizon[] = [
  ProgramHorizon.PROGRAM_3M,
  ProgramHorizon.PROGRAM_6M,
  ProgramHorizon.PROGRAM_12M,
];

const CYCLE_ORDER: BillingCycle[] = [
  BillingCycle.MONTHLY,
  BillingCycle.QUARTERLY,
  BillingCycle.SEMIANNUAL,
  BillingCycle.ANNUAL,
];

export type CyclePriceRow = {
  billingCycle: BillingCycle;
  amountCents: number;
  currency: string;
};

export type HorizonOptionRow = {
  horizon: ProgramHorizon;
  billingCycle: BillingCycle;
  isActive: boolean;
};

export type PaywallOffer = {
  horizon: ProgramHorizon;
  horizonMonths: number;
  potential: string;
  billingOptions: Array<{
    billingCycle: BillingCycle;
    billingMonths: number;
    amountCents: number;
    currency: string;
  }>;
};

/**
 * Costruisce le offerte del paywall: una per orizzonte, con le sole cadenze
 * attive che hanno un prezzo configurato. Nessun prezzo e cablato nel codice.
 */
export function buildPaywallOffers(
  prices: CyclePriceRow[],
  options: HorizonOptionRow[],
): PaywallOffer[] {
  const priceByCycle = new Map(prices.map((row) => [row.billingCycle, row]));
  return HORIZON_ORDER.map((horizon) => ({
    horizon,
    horizonMonths: PROGRAM_HORIZON_MONTHS[horizon],
    potential: PROGRAM_HORIZON_POTENTIAL[horizon],
    billingOptions: CYCLE_ORDER.filter((billingCycle) =>
      options.some(
        (option) =>
          option.horizon === horizon &&
          option.billingCycle === billingCycle &&
          option.isActive,
      ),
    ).flatMap((billingCycle) => {
      const price = priceByCycle.get(billingCycle);
      if (!price || price.amountCents <= 0) {
        return [];
      }
      return [
        {
          billingCycle,
          billingMonths: BILLING_CYCLE_MONTHS[billingCycle],
          amountCents: price.amountCents,
          currency: price.currency,
        },
      ];
    }),
  })).filter((offer) => offer.billingOptions.length > 0);
}

export function addMonths(date: Date, months: number) {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
