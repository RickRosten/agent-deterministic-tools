import { defineTool, z } from '@rickrosten/agent-deterministic-tools-core';
import {
  annualRatePercent,
  compoundingPerYear,
  CONVENTIONS,
  currency,
  dec,
  effectiveAnnualRate,
  paymentCount,
  paymentsPerYear,
  paymentTiming,
  percent,
  periodicRate,
  positiveAmount,
  rateOutput,
  rateType,
  resultBlock,
  resultOutput,
  roundingMode,
  roundNum,
  scale,
  years,
  type PaymentTiming,
} from '../common.js';
import { D, type Dec } from '../decimal.js';

const annuityInput = {
  payment: positiveAmount('Amount paid each period.'),
  annualRatePercent,
  rateType,
  compoundingPerYear,
  paymentsPerYear,
  years: years.describe('Term in years. years * paymentsPerYear must be a whole number.'),
  paymentTiming,
  scale,
  roundingMode,
  currency,
};

const annuityLimitations = [
  CONVENTIONS.rate,
  'when paymentsPerYear differs from compoundingPerYear the rate is converted to an equivalent rate per payment period: (1 + i_compounding)^(compoundingPerYear / paymentsPerYear) - 1',
  'years * paymentsPerYear must be a whole number of payments (max 12000)',
  CONVENTIONS.sign,
  CONVENTIONS.rounding,
];

/** Sum of discount/growth factors for n level payments. */
export function annuityFactor(i: Dec, n: number, kind: 'future' | 'present', timing: PaymentTiming): Dec {
  let factor: Dec;
  if (i.isZero()) factor = new D(n);
  else if (kind === 'future') factor = i.plus(1).pow(n).minus(1).div(i);
  else factor = new D(1).minus(i.plus(1).pow(-n)).div(i);
  return timing === 'begin' ? factor.times(i.plus(1)) : factor;
}

export const annuityFutureValue = defineTool({
  name: 'annuity_future_value',
  title: 'Future value of an annuity',
  description:
    'Future value of a series of equal periodic payments (savings plan): FV = PMT * ((1 + i)^n - 1) / i, multiplied by (1 + i) for payments at the beginning of each period.',
  whenToUse: ['"I save 200 per month at 6% for 20 years, how much will I have?"', 'retirement or sinking-fund contributions'],
  whenNotToUse: ['a single deposit (use finance.future_value or finance.compound_interest)', 'irregular amounts (use finance.npv)'],
  limitations: annuityLimitations,
  examples: [
    {
      input: { payment: 100, annualRatePercent: 6, rateType: 'nominal', compoundingPerYear: 12, paymentsPerYear: 12, years: 10, paymentTiming: 'end' },
      output: { result: 16387.93, totalContributions: 12000, interest: 4387.93 },
    },
  ],
  input: z.strictObject(annuityInput),
  output: z.object({
    ...resultOutput,
    result: z.number().describe('Future value of all payments, rounded to `scale`.'),
    totalContributions: z.number(),
    interest: z.number().describe('result - totalContributions.'),
    numberOfPayments: z.number().int(),
    paymentTiming: z.enum(['end', 'begin']),
    ...rateOutput,
  }),
  execute(input) {
    const n = paymentCount(input.years, input.paymentsPerYear);
    const i = periodicRate(input, input.paymentsPerYear);
    const pmt = dec(input.payment);
    const fv = pmt.times(annuityFactor(i, n, 'future', input.paymentTiming));
    const contributions = pmt.times(n);
    return {
      ...resultBlock(fv, input),
      totalContributions: roundNum(contributions, input),
      interest: roundNum(fv.minus(contributions), input),
      numberOfPayments: n,
      paymentTiming: input.paymentTiming,
      periodicRatePercent: percent(i),
      effectiveAnnualRatePercent: percent(effectiveAnnualRate(input)),
    };
  },
});

export const annuityPresentValue = defineTool({
  name: 'annuity_present_value',
  title: 'Present value of an annuity',
  description:
    'Present value of a series of equal periodic payments: PV = PMT * (1 - (1 + i)^-n) / i, multiplied by (1 + i) for payments at the beginning of each period.',
  whenToUse: ['value today of a pension or lease stream', '"how much loan can I afford with 1,500 per month?"'],
  whenNotToUse: ['a single future amount (use finance.present_value)', 'computing the payment of a loan (use finance.loan_payment)'],
  limitations: annuityLimitations,
  examples: [
    {
      input: { payment: 100, annualRatePercent: 6, rateType: 'nominal', compoundingPerYear: 12, paymentsPerYear: 12, years: 10, paymentTiming: 'end' },
      output: { result: 9007.35 },
    },
  ],
  input: z.strictObject(annuityInput),
  output: z.object({
    ...resultOutput,
    result: z.number().describe('Present value of all payments, rounded to `scale`.'),
    totalPayments: z.number(),
    numberOfPayments: z.number().int(),
    paymentTiming: z.enum(['end', 'begin']),
    ...rateOutput,
  }),
  execute(input) {
    const n = paymentCount(input.years, input.paymentsPerYear);
    const i = periodicRate(input, input.paymentsPerYear);
    const pmt = dec(input.payment);
    return {
      ...resultBlock(pmt.times(annuityFactor(i, n, 'present', input.paymentTiming)), input),
      totalPayments: roundNum(pmt.times(n), input),
      numberOfPayments: n,
      paymentTiming: input.paymentTiming,
      periodicRatePercent: percent(i),
      effectiveAnnualRatePercent: percent(effectiveAnnualRate(input)),
    };
  },
});
