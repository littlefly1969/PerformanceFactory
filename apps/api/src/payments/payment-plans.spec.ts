import { BillingCycle, ProgramHorizon } from '@prisma/client';
import { addMonths, buildPaywallOffers } from './payment-plans';

// Listino di riferimento senza sconto: 10,00 EUR al mese.
const prices = [
  { billingCycle: BillingCycle.MONTHLY, amountCents: 1000, currency: 'eur' },
  { billingCycle: BillingCycle.QUARTERLY, amountCents: 3000, currency: 'eur' },
  { billingCycle: BillingCycle.SEMIANNUAL, amountCents: 6000, currency: 'eur' },
  { billingCycle: BillingCycle.ANNUAL, amountCents: 12000, currency: 'eur' },
];

const blueprintMatrix: Array<[ProgramHorizon, BillingCycle[]]> = [
  ['PROGRAM_4M', ['MONTHLY']],
  ['PROGRAM_6M', ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL']],
  ['PROGRAM_12M', ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL']],
];

const options = blueprintMatrix.flatMap(([horizon, cycles]) =>
  cycles.map((billingCycle) => ({ horizon, billingCycle, isActive: true })),
);

// Prezzi per combinazione: 4 mesi 10,00/mese, 6 mesi 9,50, 12 mesi 8,90.
const monthlyByHorizon: Record<ProgramHorizon, number> = {
  PROGRAM_4M: 1000,
  PROGRAM_6M: 950,
  PROGRAM_12M: 890,
};

const pricedOptions = options.map((option) => ({
  ...option,
  amountCents:
    monthlyByHorizon[option.horizon] *
    { MONTHLY: 1, QUARTERLY: 3, SEMIANNUAL: 6, ANNUAL: 12 }[
      option.billingCycle
    ],
  currency: 'eur',
}));

describe('buildPaywallOffers', () => {
  it('follows the A5 horizon x billing matrix with configured prices', () => {
    const offers = buildPaywallOffers(prices, options);
    expect(
      offers.map((offer) => [
        offer.horizon,
        offer.potential,
        offer.billingOptions.map((option) => option.billingCycle),
      ]),
    ).toEqual([
      ['PROGRAM_4M', 'P4', ['MONTHLY']],
      ['PROGRAM_6M', 'P6', ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL']],
      ['PROGRAM_12M', 'P12', ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL']],
    ]);
    expect(offers[0].billingOptions[0]).toEqual({
      billingCycle: 'MONTHLY',
      billingMonths: 1,
      amountCents: 1000,
      monthlyEquivalentCents: 1000,
      currency: 'eur',
    });
  });

  it('prices each combination from the option, with the cycle list as fallback', () => {
    const offers = buildPaywallOffers(prices, pricedOptions);
    expect(
      offers.map((offer) => [
        offer.horizon,
        offer.monthlyCents,
        offer.horizonTotalCents,
        offer.savingPercent,
      ]),
    ).toEqual([
      ['PROGRAM_4M', 1000, 4000, 0],
      ['PROGRAM_6M', 950, 5700, 5],
      ['PROGRAM_12M', 890, 10680, 11],
    ]);
    const annual = offers[2].billingOptions.find(
      (option) => option.billingCycle === 'ANNUAL',
    );
    expect(annual).toEqual({
      billingCycle: 'ANNUAL',
      billingMonths: 12,
      amountCents: 10680,
      monthlyEquivalentCents: 890,
      currency: 'eur',
    });
    // Senza prezzo sulla combinazione resta il listino della cadenza.
    const listed = buildPaywallOffers(prices, [
      { horizon: 'PROGRAM_6M', billingCycle: 'SEMIANNUAL', isActive: true },
    ]);
    expect(listed[0].billingOptions[0].amountCents).toBe(6000);
  });

  it('hides inactive combinations, missing prices and empty horizons', () => {
    const offers = buildPaywallOffers(
      prices.filter((price) => price.billingCycle !== 'MONTHLY'),
      options.map((option) =>
        option.horizon === 'PROGRAM_12M' && option.billingCycle !== 'ANNUAL'
          ? { ...option, isActive: false }
          : option.horizon === 'PROGRAM_6M'
            ? { ...option, isActive: false }
            : option,
      ),
    );
    expect(
      offers.map((offer) => [
        offer.horizon,
        offer.billingOptions.map((option) => option.billingCycle),
      ]),
    ).toEqual([['PROGRAM_12M', ['ANNUAL']]]);
  });
});

describe('addMonths', () => {
  it('clamps to the last day of shorter months', () => {
    expect(addMonths(new Date('2027-01-31T10:00:00Z'), 1).toISOString()).toBe(
      '2027-02-28T10:00:00.000Z',
    );
    expect(addMonths(new Date('2026-10-07T00:00:00Z'), 12).toISOString()).toBe(
      '2027-10-07T00:00:00.000Z',
    );
  });
});
