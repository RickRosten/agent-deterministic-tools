import { defineTool, outOfRange, z } from '@rickrosten/agent-deterministic-tools-core';
import { D, sum as decimalSum, toNumber, type Dec } from './decimal.js';

export const MAX_VALUES = 1_000_000;

const EMPTY_AND_NON_FINITE =
  'empty arrays are rejected with INVALID_INPUT; NaN, Infinity, null and strings are rejected with INVALID_INPUT';

const values = z
  .array(z.number())
  .min(1)
  .max(MAX_VALUES)
  .describe(`Sample data: non-empty list of finite numbers (max ${MAX_VALUES}). NaN/Infinity are not accepted.`);

const sorted = (xs: readonly number[]): number[] => [...xs].sort((a, b) => a - b);

const mean = (xs: readonly number[]): Dec => decimalSum(xs).div(xs.length);

export const VARIANCE_KINDS = ['population', 'sample'] as const;
export type VarianceKind = (typeof VARIANCE_KINDS)[number];

const kind = z
  .enum(VARIANCE_KINDS)
  .describe(
    'Required. "population": divide by n (data is the whole population). "sample": divide by n - 1 (Bessel correction; data is a sample of a larger population).',
  );

function variance(xs: readonly number[], k: VarianceKind): { variance: Dec; mean: Dec } {
  if (k === 'sample' && xs.length < 2) {
    throw outOfRange('sample variance requires at least 2 values (n - 1 must be > 0)', 'values');
  }
  const m = mean(xs);
  let ss = new D(0);
  for (const x of xs) {
    const d = new D(x).minus(m);
    ss = ss.plus(d.times(d));
  }
  return { variance: ss.div(k === 'population' ? xs.length : xs.length - 1), mean: m };
}

export const meanTool = defineTool({
  name: 'mean',
  title: 'Mean',
  description: 'Arithmetic mean of a data set (sum / n), computed in decimal arithmetic.',
  whenToUse: ['average of a data set in a statistical context'],
  whenNotToUse: ['weighted data (use math.weighted_average)'],
  limitations: [EMPTY_AND_NON_FINITE],
  examples: [{ input: { values: [1, 2, 3, 4] }, output: { result: 2.5, count: 4 } }],
  input: z.strictObject({ values }),
  output: z.object({ result: z.number(), count: z.number().int() }),
  execute: ({ values: xs }) => ({ result: toNumber(mean(xs)), count: xs.length }),
});

export const median = defineTool({
  name: 'median',
  title: 'Median',
  description: 'Middle value of the sorted data. For an even count, the mean of the two middle values.',
  whenToUse: ['typical value robust to outliers', '50th percentile'],
  limitations: [EMPTY_AND_NON_FINITE],
  examples: [{ input: { values: [5, 1, 3, 2] }, output: { result: 2.5, count: 4 } }],
  input: z.strictObject({ values }),
  output: z.object({ result: z.number(), count: z.number().int() }),
  execute({ values: xs }) {
    const s = sorted(xs);
    const mid = Math.floor(s.length / 2);
    const result = s.length % 2 === 1 ? new D(s[mid]!) : new D(s[mid - 1]!).plus(s[mid]!).div(2);
    return { result: toNumber(result), count: xs.length };
  },
});

export const mode = defineTool({
  name: 'mode',
  title: 'Mode',
  description:
    'Most frequent value(s). Returns all values sharing the highest frequency, sorted ascending (multimodal data yields several modes).',
  whenToUse: ['most common value in a data set'],
  limitations: [
    'if every value occurs exactly once and there is more than one value, there is no mode: modes is [] and hasMode is false',
    'values are compared exactly; 0.1 + 0.2 and 0.3 are different values if they differ in binary',
    EMPTY_AND_NON_FINITE,
  ],
  examples: [{ input: { values: [1, 2, 2, 3, 3] }, output: { modes: [2, 3], frequency: 2, hasMode: true, count: 5 } }],
  input: z.strictObject({ values }),
  output: z.object({
    modes: z.array(z.number()),
    frequency: z.number().int().describe('Occurrences of each mode.'),
    hasMode: z.boolean(),
    count: z.number().int(),
  }),
  execute({ values: xs }) {
    const counts = new Map<number, number>();
    for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
    const frequency = Math.max(...counts.values());
    const hasMode = !(frequency === 1 && xs.length > 1);
    const modes = hasMode
      ? [...counts.entries()]
          .filter(([, c]) => c === frequency)
          .map(([v]) => (Object.is(v, -0) ? 0 : v))
          .sort((a, b) => a - b)
      : [];
    return { modes, frequency, hasMode, count: xs.length };
  },
});

export const varianceTool = defineTool({
  name: 'variance',
  title: 'Variance',
  description:
    'Variance of a data set. The divisor must be chosen explicitly with `kind`: population (n) or sample (n - 1).',
  whenToUse: ['spread of data around the mean'],
  whenNotToUse: ['you need spread in the original units (use statistics.standard_deviation)'],
  limitations: ['sample variance needs at least 2 values (OUT_OF_RANGE otherwise)', EMPTY_AND_NON_FINITE],
  examples: [{ input: { values: [2, 4, 4, 4, 5, 5, 7, 9], kind: 'population' }, output: { result: 4, kind: 'population', count: 8, mean: 5 } }],
  input: z.strictObject({ values, kind }),
  output: z.object({ result: z.number(), kind: z.enum(VARIANCE_KINDS), count: z.number().int(), mean: z.number() }),
  execute({ values: xs, kind: k }) {
    const v = variance(xs, k);
    return { result: toNumber(v.variance), kind: k, count: xs.length, mean: toNumber(v.mean) };
  },
});

export const standardDeviation = defineTool({
  name: 'standard_deviation',
  title: 'Standard deviation',
  description:
    'Standard deviation (square root of variance). The divisor must be chosen explicitly with `kind`: population (n) or sample (n - 1).',
  whenToUse: ['spread of data in the original units', 'volatility of a series'],
  limitations: ['sample standard deviation needs at least 2 values (OUT_OF_RANGE otherwise)', EMPTY_AND_NON_FINITE],
  examples: [{ input: { values: [2, 4, 4, 4, 5, 5, 7, 9], kind: 'population' }, output: { result: 2, kind: 'population', count: 8, mean: 5, variance: 4 } }],
  input: z.strictObject({ values, kind }),
  output: z.object({
    result: z.number(),
    kind: z.enum(VARIANCE_KINDS),
    count: z.number().int(),
    mean: z.number(),
    variance: z.number(),
  }),
  execute({ values: xs, kind: k }) {
    const v = variance(xs, k);
    return {
      result: toNumber(v.variance.sqrt()),
      kind: k,
      count: xs.length,
      mean: toNumber(v.mean),
      variance: toNumber(v.variance),
    };
  },
});

export const PERCENTILE_METHODS = ['linear', 'exclusive', 'nearest_rank', 'lower', 'higher', 'midpoint', 'nearest'] as const;
export type PercentileMethod = (typeof PERCENTILE_METHODS)[number];

function percentileOf(s: readonly number[], p: number, method: PercentileMethod): Dec {
  const n = s.length;
  const q = new D(p).div(100);
  const at = (i: number) => new D(s[i]!);
  if (method === 'nearest_rank') {
    if (q.isZero()) return at(0);
    const rank = q.times(n).ceil().toNumber();
    return at(Math.min(rank, n) - 1);
  }
  if (method === 'exclusive') {
    const h = q.times(n + 1).minus(1);
    if (h.lt(0) || h.gt(n - 1)) {
      const lo = new D(100).div(n + 1);
      const hi = new D(100).times(n).div(n + 1);
      throw outOfRange(
        `exclusive method requires percentile between ${toNumber(lo)} and ${toNumber(hi)} for ${n} values`,
        'percentile',
        { min: toNumber(lo), max: toNumber(hi) },
      );
    }
    const lo = h.floor().toNumber();
    const frac = h.minus(lo);
    return lo + 1 < n ? at(lo).plus(at(lo + 1).minus(at(lo)).times(frac)) : at(lo);
  }
  const h = q.times(n - 1);
  const lo = h.floor().toNumber();
  const hi = h.ceil().toNumber();
  switch (method) {
    case 'linear':
      return at(lo).plus(at(hi).minus(at(lo)).times(h.minus(lo)));
    case 'lower':
      return at(lo);
    case 'higher':
      return at(hi);
    case 'midpoint':
      return at(lo).plus(at(hi)).div(2);
    case 'nearest':
      return at(h.toDecimalPlaces(0, D.ROUND_HALF_EVEN).toNumber());
  }
}

export const percentile = defineTool({
  name: 'percentile',
  title: 'Percentile',
  description:
    'Value below which a given percentage of the data falls. The interpolation method is explicit and echoed in the output.',
  whenToUse: ['quartiles (25, 50, 75)', 'p90/p95/p99 latency', 'Excel PERCENTILE.INC (method linear) or PERCENTILE.EXC (method exclusive)'],
  limitations: [
    'percentile is on a 0-100 scale (25 = first quartile), not 0-1',
    'methods: linear = R-7 / Excel PERCENTILE.INC / NumPy default (default); exclusive = R-6 / Excel PERCENTILE.EXC; nearest_rank = smallest value with at least p% of data at or below it; lower / higher / midpoint / nearest = NumPy methods of the same name (nearest uses round-half-even)',
    'exclusive rejects percentiles outside [100/(n+1), 100*n/(n+1)] with OUT_OF_RANGE',
    EMPTY_AND_NON_FINITE,
  ],
  examples: [{ input: { values: [1, 2, 3, 4], percentile: 25, method: 'linear' }, output: { result: 1.75, percentile: 25, method: 'linear', count: 4 } }],
  input: z.strictObject({
    values,
    percentile: z.number().min(0).max(100).describe('Percentile on a 0-100 scale.'),
    method: z.enum(PERCENTILE_METHODS).default('linear').describe('Interpolation method. Default "linear" (Excel PERCENTILE.INC).'),
  }),
  output: z.object({
    result: z.number(),
    percentile: z.number(),
    method: z.enum(PERCENTILE_METHODS),
    count: z.number().int(),
  }),
  execute({ values: xs, percentile: p, method }) {
    return { result: toNumber(percentileOf(sorted(xs), p, method)), percentile: p, method, count: xs.length };
  },
});

export const minTool = defineTool({
  name: 'min',
  title: 'Minimum',
  description: 'Smallest value of a data set.',
  whenToUse: ['lower bound of observed data'],
  limitations: [EMPTY_AND_NON_FINITE],
  examples: [{ input: { values: [4, 1, 9] }, output: { result: 1, count: 3 } }],
  input: z.strictObject({ values }),
  output: z.object({ result: z.number(), count: z.number().int() }),
  execute: ({ values: xs }) => ({ result: xs.reduce((a, b) => (b < a ? b : a)) || 0, count: xs.length }),
});

export const maxTool = defineTool({
  name: 'max',
  title: 'Maximum',
  description: 'Largest value of a data set.',
  whenToUse: ['upper bound of observed data'],
  limitations: [EMPTY_AND_NON_FINITE],
  examples: [{ input: { values: [4, 1, 9] }, output: { result: 9, count: 3 } }],
  input: z.strictObject({ values }),
  output: z.object({ result: z.number(), count: z.number().int() }),
  execute: ({ values: xs }) => ({ result: xs.reduce((a, b) => (b > a ? b : a)) || 0, count: xs.length }),
});

export const sumTool = defineTool({
  name: 'sum',
  title: 'Sum',
  description: 'Exact sum of a data set (decimal arithmetic, rounded once to the nearest double).',
  whenToUse: ['total of observations'],
  limitations: [EMPTY_AND_NON_FINITE],
  examples: [{ input: { values: [0.1, 0.2, 0.3] }, output: { result: 0.6, count: 3 } }],
  input: z.strictObject({ values }),
  output: z.object({ result: z.number(), count: z.number().int() }),
  execute: ({ values: xs }) => ({ result: toNumber(decimalSum(xs)), count: xs.length }),
});
