import { ErrorCode, invalidInput, ToolError, z } from '@rickrosten/agent-deterministic-tools-core';
import { D, INTERNAL_PRECISION, ROUNDING_MODE_MAP, ROUNDING_MODES, toNumber, type Dec, type RoundingMode } from './decimal.js';

export const MAX_AMOUNT = 1e15;
export const MAX_PERIODS = 12_000;

const DECIMAL_STRING = /^-?\d{1,16}(\.\d{1,20})?$/;

/** Amount accepted as a JSON number or an exact decimal string ("1234.56"). */
export const amount = (description: string) =>
  z
    .union([z.number(), z.string().regex(DECIMAL_STRING, 'must be a decimal number such as "1234.56"')])
    .describe(`${description} Number or exact decimal string. Positive magnitude.`);

function parseAmount(v: unknown): Dec | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? new D(v) : undefined;
  if (typeof v === 'string' && DECIMAL_STRING.test(v)) return new D(v);
  return undefined;
}

export const nonNegativeAmount = (description: string) =>
  amount(description).refine(
    (v) => {
      const d = parseAmount(v);
      return d === undefined || (d.gte(0) && d.lte(MAX_AMOUNT));
    },
    { message: `must be between 0 and ${MAX_AMOUNT}` },
  );

export const positiveAmount = (description: string) =>
  amount(description).refine(
    (v) => {
      const d = parseAmount(v);
      return d === undefined || (d.gt(0) && d.lte(MAX_AMOUNT));
    },
    { message: `must be greater than 0 and at most ${MAX_AMOUNT}` },
  );

export const annualRatePercent = z
  .number()
  .gt(-100)
  .max(10_000)
  .describe('Annual interest rate in PERCENT (5 means 5%, not 0.05). Must be greater than -100.');

export const RATE_TYPES = ['nominal', 'effective'] as const;
export type RateType = (typeof RATE_TYPES)[number];

export const rateType = z
  .enum(RATE_TYPES)
  .describe(
    'Required. "nominal": annual rate r is split evenly across compounding periods (r / compoundingPerYear, like APR). "effective": annual rate already includes compounding (like APY/AER); the result does not depend on compoundingPerYear.',
  );

export const compoundingPerYear = z
  .number()
  .int()
  .min(1)
  .max(366)
  .describe('Required. Compounding periods per year: 1 annual, 2 semiannual, 4 quarterly, 12 monthly, 52 weekly, 365 daily.');

export const paymentsPerYear = z
  .number()
  .int()
  .min(1)
  .max(366)
  .describe('Required. Payments per year: 12 for monthly payments, 4 quarterly, 1 annual.');

export const PAYMENT_TIMINGS = ['end', 'begin'] as const;
export type PaymentTiming = (typeof PAYMENT_TIMINGS)[number];

export const paymentTiming = z
  .enum(PAYMENT_TIMINGS)
  .describe('Required. "end": payments at the end of each period (ordinary annuity, typical loans). "begin": at the start (annuity due, e.g. rent).');

export const years = z.number().min(0).max(1000).describe('Duration in years (may be fractional, e.g. 1.5).');

export const scale = z
  .number()
  .int()
  .min(0)
  .max(10)
  .default(2)
  .describe('Decimal places of monetary results. Default 2. Use 0 for currencies without minor units (JPY).');

export const roundingMode = z
  .enum(ROUNDING_MODES)
  .default('half_up')
  .describe('Rounding mode applied only to final results. Default half_up (half away from zero, like Excel ROUND).');

export const currency = z
  .string()
  .regex(/^[A-Z]{3}$/, 'must be an ISO 4217 code such as "EUR"')
  .optional()
  .describe('Optional ISO 4217 currency code. Adds `currency` and a `formatted` string to the output.');

export const roundingOutput = {
  scale: z.number().int(),
  roundingMode: z.enum(ROUNDING_MODES),
  internalPrecision: z.number().int().describe('Significant digits used for intermediate calculations.'),
  currency: z.string().optional(),
  formatted: z.string().optional().describe('Human-readable main result, e.g. "€18,472.39".'),
};

export interface RoundingOptions {
  scale: number;
  roundingMode: RoundingMode;
  currency?: string | undefined;
}

export function dec(value: number | string): Dec {
  return new D(value);
}

export function roundDec(value: Dec, opts: RoundingOptions): Dec {
  return value.toDecimalPlaces(opts.scale, ROUNDING_MODE_MAP[opts.roundingMode]);
}

/** Rounds to the configured scale and returns a JS number (exact for typical money values). */
export function roundNum(value: Dec, opts: RoundingOptions): number {
  return toNumber(roundDec(value, opts));
}

function formatCurrency(value: Dec, opts: RoundingOptions): string | undefined {
  if (!opts.currency) return undefined;
  try {
    const nf = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: opts.currency,
      minimumFractionDigits: opts.scale,
      maximumFractionDigits: opts.scale,
    });
    return nf.format(value.toFixed(opts.scale) as unknown as number);
  } catch {
    throw invalidInput(`currency "${opts.currency}" is not a supported ISO 4217 code`, 'currency');
  }
}

/** Standard block describing the main result and how it was rounded. */
export function resultBlock(value: Dec, opts: RoundingOptions) {
  const rounded = roundDec(value, opts);
  const out: {
    result: number;
    resultDecimal: string;
    scale: number;
    roundingMode: RoundingMode;
    internalPrecision: number;
    currency?: string;
    formatted?: string;
  } = {
    result: toNumber(rounded),
    resultDecimal: rounded.toFixed(opts.scale),
    scale: opts.scale,
    roundingMode: opts.roundingMode,
    internalPrecision: INTERNAL_PRECISION,
  };
  const formatted = formatCurrency(rounded, opts);
  if (opts.currency) out.currency = opts.currency;
  if (formatted !== undefined) out.formatted = formatted;
  return out;
}

export const resultOutput = {
  result: z.number().describe('Main result rounded to `scale`.'),
  resultDecimal: z.string().describe('Main result as an exact decimal string with `scale` decimals.'),
  ...roundingOutput,
};

export interface RateSpec {
  annualRatePercent: number;
  rateType: RateType;
  compoundingPerYear: number;
}

/** Rate per compounding period. */
export function compoundingRate(spec: RateSpec): Dec {
  const r = new D(spec.annualRatePercent).div(100);
  return spec.rateType === 'nominal'
    ? r.div(spec.compoundingPerYear)
    : r.plus(1).pow(new D(1).div(spec.compoundingPerYear)).minus(1);
}

/** Rate per payment period, converting between compounding and payment frequency when they differ. */
export function periodicRate(spec: RateSpec, periodsPerYear: number): Dec {
  const ic = compoundingRate(spec);
  if (periodsPerYear === spec.compoundingPerYear) return ic;
  return ic.plus(1).pow(new D(spec.compoundingPerYear).div(periodsPerYear)).minus(1);
}

export function effectiveAnnualRate(spec: RateSpec): Dec {
  return compoundingRate(spec).plus(1).pow(spec.compoundingPerYear).minus(1);
}

/** Number of whole payment periods; rejects fractional counts. */
export function paymentCount(yearsValue: number, perYear: number): number {
  const n = new D(yearsValue).times(perYear);
  if (!n.isInteger()) {
    throw invalidInput(
      `years * paymentsPerYear must be a whole number of payments (got ${n.toString()})`,
      'years',
    );
  }
  const count = n.toNumber();
  if (count < 1) throw invalidInput('the term must contain at least one payment', 'years');
  if (count > MAX_PERIODS) {
    throw new ToolError(ErrorCode.OUT_OF_RANGE, `at most ${MAX_PERIODS} payments are supported (got ${count})`, {
      field: 'years',
    });
  }
  return count;
}

export const percent = (rate: Dec, decimals = 10): number => toNumber(rate.times(100).toDecimalPlaces(decimals));

export const rateOutput = {
  periodicRatePercent: z.number().describe('Interest rate per period in percent (10 decimals).'),
  effectiveAnnualRatePercent: z.number().describe('Effective annual rate (APY) in percent (10 decimals).'),
};

export const CONVENTIONS = {
  sign: 'sign convention: all amounts are positive magnitudes and results are positive',
  rounding: 'intermediate values keep 34 significant digits; only final results are rounded to `scale` with `roundingMode`',
  dayCount: 'no day-count convention is applied: time is measured in years and periods',
  rate: 'annualRatePercent is in percent (5 = 5%)',
} as const;
