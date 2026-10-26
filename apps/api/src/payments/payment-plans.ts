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

/**
 * Orizzonte di ingresso: il suo prezzo al mese e il riferimento da cui si
 * misura il vantaggio degli orizzonti piu lunghi mostrato nel paywall.
 */
export const BASELINE_HORIZON: ProgramHorizon = 'PROGRAM_3M';

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
  /** Prezzo della rata per questa combinazione; nullo: vale il listino. */
  amountCents?: number | null;
  currency?: string | null;
};

/**
 * Prezzo della rata: vince quello della combinazione orizzonte x cadenza,
 * altrimenti il listino della cadenza. Nessun prezzo e cablato nel codice.
 */
export function resolveAmount(
  option: HorizonOptionRow | undefined,
  price: CyclePriceRow | undefined,
): { amountCents: number; currency: string } | null {
  const amountCents = option?.amountCents ?? price?.amountCents ?? 0;
  const currency = option?.currency ?? price?.currency ?? null;
  if (amountCents <= 0 || !currency) {
    return null;
  }
  return { amountCents, currency };
}

/** Prezzo al mese della rata, arrotondato al centesimo. */
export function monthlyEquivalentCents(
  amountCents: number,
  billingCycle: BillingCycle,
) {
  return Math.round(amountCents / BILLING_CYCLE_MONTHS[billingCycle]);
}

export type PaywallOffer = {
  horizon: ProgramHorizon;
  horizonMonths: number;
  potential: string;
  /** Prezzo al mese dell'orizzonte, dalla cadenza mensile o dalla piu corta attiva. */
  monthlyCents: number;
  /**
   * Costo di tutto il percorso: la rata di riferimento per il numero di rate,
   * cosi coincide con quanto si paga davvero anche quando il prezzo al mese
   * e arrotondato.
   */
  horizonTotalCents: number;
  currency: string;
  /**
   * Vantaggio sull'orizzonte di ingresso, in punti percentuali interi sul
   * prezzo al mese: 0 per l'orizzonte di ingresso stesso.
   */
  savingPercent: number;
  billingOptions: Array<{
    billingCycle: BillingCycle;
    billingMonths: number;
    amountCents: number;
    monthlyEquivalentCents: number;
    currency: string;
  }>;
};

/**
 * Costruisce le offerte del paywall: una per orizzonte, con le sole cadenze
 * attive che hanno un prezzo configurato. Nessun prezzo e cablato nel codice:
 * il prezzo della combinazione, se c'e, porta il vantaggio dell'orizzonte piu
 * lungo (A5-D01).
 */
export function buildPaywallOffers(
  prices: CyclePriceRow[],
  options: HorizonOptionRow[],
): PaywallOffer[] {
  const priceByCycle = new Map(prices.map((row) => [row.billingCycle, row]));
  const offers = HORIZON_ORDER.map((horizon) => {
    const billingOptions = CYCLE_ORDER.flatMap((billingCycle) => {
      const option = options.find(
        (row) => row.horizon === horizon && row.billingCycle === billingCycle,
      );
      if (!option?.isActive) {
        return [];
      }
      const amount = resolveAmount(option, priceByCycle.get(billingCycle));
      if (!amount) {
        return [];
      }
      return [
        {
          billingCycle,
          billingMonths: BILLING_CYCLE_MONTHS[billingCycle],
          amountCents: amount.amountCents,
          monthlyEquivalentCents: monthlyEquivalentCents(
            amount.amountCents,
            billingCycle,
          ),
          currency: amount.currency,
        },
      ];
    });
    // Il prezzo al mese mostrato e quello della cadenza piu corta attiva:
    // il mensile quando c'e, cosi la cifra e quella che l'atleta paghera.
    const reference = billingOptions[0];
    const horizonMonths = PROGRAM_HORIZON_MONTHS[horizon];
    const monthlyCents = reference?.monthlyEquivalentCents ?? 0;
    const installments = reference
      ? Math.ceil(horizonMonths / reference.billingMonths)
      : 0;
    return {
      horizon,
      horizonMonths,
      potential: PROGRAM_HORIZON_POTENTIAL[horizon],
      monthlyCents,
      horizonTotalCents: (reference?.amountCents ?? 0) * installments,
      currency: reference?.currency ?? '',
      savingPercent: 0,
      billingOptions,
    };
  }).filter((offer) => offer.billingOptions.length > 0);

  const baseline =
    offers.find((offer) => offer.horizon === BASELINE_HORIZON)?.monthlyCents ??
    offers[0]?.monthlyCents ??
    0;
  return offers.map((offer) =>
    baseline > 0 && offer.monthlyCents < baseline
      ? {
          ...offer,
          savingPercent: Math.round(
            ((baseline - offer.monthlyCents) / baseline) * 100,
          ),
        }
      : offer,
  );
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
