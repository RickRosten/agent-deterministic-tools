import { defineTool, ErrorCode, ToolError, z } from '@rickrosten/agent-deterministic-tools-core';
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
  roundDec,
  roundingMode,
  roundNum,
  scale,
  years,
  type PaymentTiming,
  type RoundingOptions,
} from '../common.js';
import { D, toNumber, type Dec } from '../decimal.js';
import { annuityFactor } from './annuity.js';

export const MAX_SCHEDULE_ROWS = 2000;

const loanInput = {
  principal: positiveAmount('Loan amount borrowed.'),
  annualRatePercent: annualRatePercent.min(0).describe('Annual interest rate in PERCENT (6.5 means 6.5%). Must be >= 0.'),
  rateType,
  compoundingPerYear,
  paymentsPerYear,
  years: years.describe('Loan term in years. years * paymentsPerYear must be a whole number.'),
  paymentTiming,
  scale,
  roundingMode,
  currency,
};

export const LOAN_ROUNDING_RULE =
  'schedule rule: the level payment is rounded to `scale`; each period\'s interest is rounded to `scale`; principal = payment - interest; the final payment is adjusted so the balance ends at exactly 0';

const loanLimitations = [
  CONVENTIONS.rate,
  'most mortgages quote a nominal rate compounded with the payment frequency (e.g. rateType nominal, compoundingPerYear 12, paymentsPerYear 12); Canadian mortgages use compoundingPerYear 2',
  'with paymentTiming "begin" the first payment is due at signing and carries no interest',
  LOAN_ROUNDING_RULE,
  'fully amortizing loans only (no balloon, no fees, no grace periods)',
  CONVENTIONS.sign,
];

export interface ScheduleRow {
  period: number;
  payment: Dec;
  interest: Dec;
  principal: Dec;
  balance: Dec;
}

export interface LoanComputation {
  n: number;
  i: Dec;
  payment: Dec;
  finalPayment: Dec;
  totalPaid: Dec;
  totalInterest: Dec;
  rows: ScheduleRow[];
}

export function computeLoan(
  input: { principal: number | string; years: number; paymentsPerYear: number; paymentTiming: PaymentTiming } & Parameters<typeof periodicRate>[0],
  opts: RoundingOptions,
): LoanComputation {
  const n = paymentCount(input.years, input.paymentsPerYear);
  const i = periodicRate(input, input.paymentsPerYear);
  const principal = dec(input.principal);
  const payment = roundDec(principal.div(annuityFactor(i, n, 'present', input.paymentTiming)), opts);
  if (payment.lte(0)) {
    throw new ToolError(ErrorCode.PRECISION_ERROR, 'the periodic payment rounds to 0 at the requested scale; increase `scale`', {
      field: 'scale',
    });
  }
  const rows: ScheduleRow[] = [];
  let balance = principal;
  let totalPaid = new D(0);
  let totalInterest = new D(0);
  for (let k = 1; k <= n && balance.gt(0); k++) {
    const interest = input.paymentTiming === 'begin' && k === 1 ? new D(0) : roundDec(balance.times(i), opts);
    let principalPart = payment.minus(interest);
    let thisPayment = payment;
    if (k === n || principalPart.gte(balance)) {
      principalPart = balance;
      thisPayment = balance.plus(interest);
    }
    balance = balance.minus(principalPart);
    totalPaid = totalPaid.plus(thisPayment);
    totalInterest = totalInterest.plus(interest);
    rows.push({ period: k, payment: thisPayment, interest, principal: principalPart, balance });
  }
  return { n, i, payment, finalPayment: rows[rows.length - 1]!.payment, totalPaid, totalInterest, rows };
}

const loanSummaryOutput = {
  numberOfPayments: z.number().int(),
  finalPayment: z.number().describe('Last payment after rounding adjustment.'),
  totalOfPayments: z.number(),
  totalInterest: z.number(),
  paymentTiming: z.enum(['end', 'begin']),
  ...rateOutput,
};

function summary(loan: LoanComputation, input: Parameters<typeof effectiveAnnualRate>[0] & { paymentTiming: PaymentTiming }, opts: RoundingOptions) {
  return {
    numberOfPayments: loan.rows.length,
    finalPayment: roundNum(loan.finalPayment, opts),
    totalOfPayments: roundNum(loan.totalPaid, opts),
    totalInterest: roundNum(loan.totalInterest, opts),
    paymentTiming: input.paymentTiming,
    periodicRatePercent: percent(loan.i),
    effectiveAnnualRatePercent: percent(effectiveAnnualRate(input)),
  };
}

const mortgageExample = {
  principal: 200000,
  annualRatePercent: 6,
  rateType: 'nominal',
  compoundingPerYear: 12,
  paymentsPerYear: 12,
  years: 30,
  paymentTiming: 'end',
};

export const loanPayment = defineTool({
  name: 'loan_payment',
  title: 'Loan payment',
  description:
    'Level periodic payment of a fully amortizing loan: PMT = P * i / (1 - (1 + i)^-n) (divided by (1 + i) for payments at the beginning of periods).',
  whenToUse: ['monthly mortgage or car loan payment', '"what is the payment on 200,000 at 6% for 30 years?"'],
  whenNotToUse: ['you need the full schedule (use finance.loan_amortization)', 'only total interest (use finance.total_interest)'],
  limitations: loanLimitations,
  examples: [{ input: mortgageExample, output: { result: 1199.1 } }],
  input: z.strictObject(loanInput),
  output: z.object({ ...resultOutput, result: z.number().describe('Level payment per period, rounded to `scale`.'), ...loanSummaryOutput }),
  execute(input) {
    const loan = computeLoan(input, input);
    return { ...resultBlock(loan.payment, input), ...summary(loan, input, input) };
  },
});

export const totalInterest = defineTool({
  name: 'total_interest',
  title: 'Total interest of a loan',
  description: 'Total interest paid over the life of a fully amortizing loan, computed from the rounded amortization schedule.',
  whenToUse: ['"how much interest will I pay in total on my mortgage?"', 'comparing total cost of loan offers'],
  whenNotToUse: ['interest earned on savings (use finance.compound_interest)'],
  limitations: loanLimitations,
  examples: [{ input: mortgageExample, output: { result: 231677.04 } }],
  input: z.strictObject(loanInput),
  output: z.object({
    ...resultOutput,
    result: z.number().describe('Total interest, rounded to `scale`.'),
    payment: z.number(),
    ...loanSummaryOutput,
  }),
  execute(input) {
    const loan = computeLoan(input, input);
    return { ...resultBlock(loan.totalInterest, input), payment: roundNum(loan.payment, input), ...summary(loan, input, input) };
  },
});

export const loanAmortization = defineTool({
  name: 'loan_amortization',
  title: 'Loan amortization schedule',
  description:
    'Full amortization schedule of a fully amortizing loan: payment, interest, principal and remaining balance for every period.',
  whenToUse: ['period-by-period breakdown of a loan', 'remaining balance after k payments'],
  whenNotToUse: ['only the payment amount is needed (use finance.loan_payment; the schedule is large)'],
  limitations: [...loanLimitations, `at most ${MAX_SCHEDULE_ROWS} periods`],
  examples: [
    {
      input: { principal: 1000, annualRatePercent: 12, rateType: 'nominal', compoundingPerYear: 12, paymentsPerYear: 12, years: 0.25, paymentTiming: 'end' },
    },
  ],
  input: z.strictObject(loanInput),
  output: z.object({
    ...resultOutput,
    result: z.number().describe('Level payment per period, rounded to `scale`.'),
    ...loanSummaryOutput,
    schedule: z.array(
      z.object({
        period: z.number().int(),
        payment: z.number(),
        interest: z.number(),
        principal: z.number(),
        balance: z.number(),
      }),
    ),
  }),
  execute(input) {
    const n = paymentCount(input.years, input.paymentsPerYear);
    if (n > MAX_SCHEDULE_ROWS) {
      throw new ToolError(ErrorCode.OUT_OF_RANGE, `schedules are limited to ${MAX_SCHEDULE_ROWS} periods (got ${n}); use finance.loan_payment or finance.total_interest`, {
        field: 'years',
      });
    }
    const loan = computeLoan(input, input);
    return {
      ...resultBlock(loan.payment, input),
      ...summary(loan, input, input),
      schedule: loan.rows.map((r) => ({
        period: r.period,
        payment: toNumber(r.payment),
        interest: toNumber(r.interest),
        principal: toNumber(r.principal),
        balance: toNumber(r.balance),
      })),
    };
  },
});
