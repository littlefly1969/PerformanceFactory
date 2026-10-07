import { BillingCycle, ProgramHorizon } from '@prisma/client';
import { addMonths, buildPaywallOffers } from './payment-plans';

const prices = [
  { billingCycle: BillingCycle.MONTHLY, amountCents: 1990, currency: 'eur' },
  { billingCycle: BillingCycle.QUARTERLY, amountCents: 5000, currency: 'eur' },
  { billingCycle: BillingCycle.SEMIANNUAL, amountCents: 9000, currency: 'eur' },
  { billingCycle: BillingCycle.ANNUAL, amountCents: 15000, currency: 'eur' },
];

const blueprintMatrix: Array<[ProgramHorizon, BillingCycle[]]> = [
  ['PROGRAM_3M', ['MONTHLY', 'QUARTERLY']],
  ['PROGRAM_6M', ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL']],
  ['PROGRAM_12M', ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL']],
];

const options = blueprintMatrix.flatMap(([horizon, cycles]) =>
  cycles.map((billingCycle) => ({ horizon, billingCycle, isActive: true })),
);

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
      ['PROGRAM_3M', 'P3', ['MONTHLY', 'QUARTERLY']],
      ['PROGRAM_6M', 'P6', ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL']],
      ['PROGRAM_12M', 'P12', ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL']],
    ]);
    expect(offers[0].billingOptions[0]).toEqual({
      billingCycle: 'MONTHLY',
      billingMonths: 1,
      amountCents: 1990,
      currency: 'eur',
    });
  });

  it('hides inactive combinations, missing prices and empty horizons', () => {
    const offers = buildPaywallOffers(
      prices.filter((price) => price.billingCycle !== 'QUARTERLY'),
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
    ).toEqual([
      ['PROGRAM_3M', ['MONTHLY']],
      ['PROGRAM_12M', ['ANNUAL']],
    ]);
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
