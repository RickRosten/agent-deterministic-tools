import { defineTool, invalidInput, z } from '@rickrosten/agent-deterministic-tools-core';
import {
  annualRatePercent,
  compoundingPerYear,
  compoundingRate,
  CONVENTIONS,
  currency,
  dec,
  effectiveAnnualRate,
  nonNegativeAmount,
  percent,
  positiveAmount,
  rateOutput,
  rateType,
  resultBlock,
  resultOutput,
  roundingMode,
  roundNum,
  scale,
  years,
} from '../common.js';
import { D, toNumber } from '../decimal.js';

const growthInput = {
  annualRatePercent,
  rateType,
  compoundingPerYear,
  years,
  scale,
  roundingMode,
  currency,
};

function growthFactor(input: { annualRatePercent: number; rateType: 'nominal' | 'effective'; compoundingPerYear: number; years: number }) {
  const ic = compoundingRate(input);
  const periods = new D(input.years).times(input.compoundingPerYear);
  return { factor: ic.plus(1).pow(periods), ic, periods };
}

const growthLimitations = [
  CONVENTIONS.rate,
  'fractional periods (e.g. 1.5 years with annual compounding) are compounded exponentially',
  CONVENTIONS.rounding,
  CONVENTIONS.dayCount,
];

export const compoundInterest = defineTool({
  name: 'compound_interest',
  title: 'Compound interest',
  description:
    'Future value and interest earned on a single deposit with compound interest: FV = principal * (1 + i)^(compoundingPerYear * years).',
  whenToUse: ['"how much will 10,000 grow to at 5% compounded monthly over 10 years?"', 'interest earned on savings'],
  whenNotToUse: [
    'regular deposits or payments (use finance.annuity_future_value)',
    'interest without compounding (use finance.simple_interest)',
  ],
  limitations: growthLimitations,
  examples: [
    {
      input: { principal: 10000, annualRatePercent: 5, rateType: 'nominal', compoundingPerYear: 12, years: 10 },
      output: { result: 16470.09, interest: 6470.09 },
    },
  ],
  input: z.strictObject({ principal: positiveAmount('Initial deposit.'), ...growthInput }),
  output: z.object({
    ...resultOutput,
    result: z.number().describe('Future value (principal + interest), rounded to `scale`.'),
    interest: z.number().describe('Interest earned, rounded to `scale`.'),
    periods: z.number().describe('Number of compounding periods.'),
    ...rateOutput,
  }),
  execute(input) {
    const p = dec(input.principal);
    const { factor, ic, periods } = growthFactor(input);
    const fv = p.times(factor);
    return {
      ...resultBlock(fv, input),
      interest: roundNum(fv.minus(p), input),
      periods: toNumber(periods),
      periodicRatePercent: percent(ic),
      effectiveAnnualRatePercent: percent(effectiveAnnualRate(input)),
    };
  },
});

export const futureValue = defineTool({
  name: 'future_value',
  title: 'Future value of a lump sum',
  description: 'Future value of a single present amount: FV = PV * (1 + i)^n, with an explicit rate convention.',
  whenToUse: ['value of money today at a future date', 'inflation-adjusted future cost with an annual inflation rate'],
  whenNotToUse: ['series of payments (use finance.annuity_future_value)', 'you need the interest amount (use finance.compound_interest)'],
  limitations: growthLimitations,
  examples: [
    { input: { presentValue: 1000, annualRatePercent: 7, rateType: 'effective', compoundingPerYear: 1, years: 5 }, output: { result: 1402.55 } },
  ],
  input: z.strictObject({ presentValue: nonNegativeAmount('Amount today.'), ...growthInput }),
  output: z.object({ ...resultOutput, periods: z.number(), ...rateOutput }),
  execute(input) {
    const { factor, ic, periods } = growthFactor(input);
    return {
      ...resultBlock(dec(input.presentValue).times(factor), input),
      periods: toNumber(periods),
      periodicRatePercent: percent(ic),
      effectiveAnnualRatePercent: percent(effectiveAnnualRate(input)),
    };
  },
});

export const presentValue = defineTool({
  name: 'present_value',
  title: 'Present value of a future lump sum',
  description: 'Discounts a single future amount to today: PV = FV / (1 + i)^n, with an explicit rate convention.',
  whenToUse: ['"how much must I invest today to have 50,000 in 8 years at 6%?"', 'discounting a single future payment'],
  whenNotToUse: ['series of payments (use finance.annuity_present_value)', 'irregular cash flows (use finance.npv)'],
  limitations: growthLimitations,
  examples: [
    { input: { futureValue: 50000, annualRatePercent: 6, rateType: 'effective', compoundingPerYear: 1, years: 8 }, output: { result: 31370.62 } },
  ],
  input: z.strictObject({ futureValue: nonNegativeAmount('Amount at the future date.'), ...growthInput }),
  output: z.object({
    ...resultOutput,
    discount: z.number().describe('futureValue - presentValue, rounded to `scale`.'),
    periods: z.number(),
    ...rateOutput,
  }),
  execute(input) {
    const fv = dec(input.futureValue);
    const { factor, ic, periods } = growthFactor(input);
    const pv = fv.div(factor);
    return {
      ...resultBlock(pv, input),
      discount: roundNum(fv.minus(pv), input),
      periods: toNumber(periods),
      periodicRatePercent: percent(ic),
      effectiveAnnualRatePercent: percent(effectiveAnnualRate(input)),
    };
  },
});

export const DAY_COUNTS = ['actual_360', 'actual_365'] as const;

export const simpleInterest = defineTool({
  name: 'simple_interest',
  title: 'Simple interest',
  description:
    'Simple (non-compounding) interest: interest = principal * annualRate * time. Time is given either in years, or in days together with an explicit day-count convention.',
  whenToUse: ['short-term loans or deposits without compounding', 'interest for a number of days with Actual/360 or Actual/365'],
  whenNotToUse: ['interest that compounds (use finance.compound_interest)'],
  limitations: [
    CONVENTIONS.rate,
    'provide exactly one of `years` or `days`; `dayCount` is required with `days`: actual_360 uses days/360, actual_365 uses days/365',
    CONVENTIONS.rounding,
  ],
  examples: [
    { input: { principal: 5000, annualRatePercent: 4, years: 2 }, output: { result: 400, totalAmount: 5400 } },
    { input: { principal: 1000000, annualRatePercent: 3.5, days: 90, dayCount: 'actual_360' }, output: { result: 8750 } },
  ],
  input: z.strictObject({
    principal: positiveAmount('Principal.'),
    annualRatePercent,
    years: years.optional(),
    days: z.number().int().min(0).max(366_000).optional().describe('Number of days (requires dayCount).'),
    dayCount: z.enum(DAY_COUNTS).optional().describe('Day-count convention used with `days`.'),
    scale,
    roundingMode,
    currency,
  }),
  output: z.object({
    ...resultOutput,
    result: z.number().describe('Interest amount, rounded to `scale`.'),
    totalAmount: z.number().describe('principal + interest, rounded to `scale`.'),
    yearFraction: z.number().describe('Time in years used in the calculation.'),
    dayCount: z.enum(DAY_COUNTS).nullable(),
  }),
  execute(input) {
    const hasYears = input.years !== undefined;
    const hasDays = input.days !== undefined;
    if (hasYears === hasDays) throw invalidInput('provide exactly one of `years` or `days`', hasYears ? 'days' : 'years');
    if (hasDays && !input.dayCount) throw invalidInput('dayCount is required when `days` is provided (actual_360 or actual_365)', 'dayCount');
    if (hasYears && input.dayCount) throw invalidInput('dayCount is only allowed together with `days`', 'dayCount');
    const t = hasYears ? new D(input.years!) : new D(input.days!).div(input.dayCount === 'actual_360' ? 360 : 365);
    const p = dec(input.principal);
    const interest = p.times(input.annualRatePercent).div(100).times(t);
    return {
      ...resultBlock(interest, input),
      totalAmount: roundNum(p.plus(interest), input),
      yearFraction: toNumber(t.toDecimalPlaces(12)),
      dayCount: input.dayCount ?? null,
    };
  },
});
