import { defineTool, divisionByZero, invalidInput, z } from '@rickrosten/agent-deterministic-tools-core';
import { D, sum as decimalSum, toNumber } from '../decimal.js';
import { MAX_VALUES, values } from '../schemas.js';

export const sum = defineTool({
  name: 'sum',
  title: 'Sum of numbers',
  description: 'Adds a list of numbers exactly (decimal arithmetic, then rounded once to the nearest double).',
  whenToUse: ['totals of several amounts', 'avoiding floating-point drift such as 0.1 + 0.2 = 0.30000000000000004'],
  whenNotToUse: ['money with currency-specific rounding (use finance tools)'],
  examples: [{ input: { values: [0.1, 0.2] }, output: { result: 0.3, count: 2 } }],
  input: z.strictObject({ values }),
  output: z.object({ result: z.number(), count: z.number().int() }),
  execute({ values: xs }) {
    return { result: toNumber(decimalSum(xs)), count: xs.length };
  },
});

export const average = defineTool({
  name: 'average',
  title: 'Arithmetic mean',
  description: 'Calculates the arithmetic mean (sum / count) of a list of numbers.',
  whenToUse: ['plain average of values'],
  whenNotToUse: [
    'values have different importance (use math.weighted_average)',
    'you also need median/variance (use statistics.* tools)',
  ],
  examples: [{ input: { values: [2, 4, 9] }, output: { result: 5, count: 3, sum: 15 } }],
  input: z.strictObject({ values }),
  output: z.object({ result: z.number(), count: z.number().int(), sum: z.number() }),
  execute({ values: xs }) {
    const total = decimalSum(xs);
    return { result: toNumber(total.div(xs.length)), count: xs.length, sum: toNumber(total) };
  },
});

export const weightedAverage = defineTool({
  name: 'weighted_average',
  title: 'Weighted average',
  description: 'Calculates sum(values[i] * weights[i]) / sum(weights).',
  whenToUse: ['grade point averages with credit weights', 'average price weighted by quantity'],
  whenNotToUse: ['all weights are equal (use math.average)'],
  limitations: ['values and weights must have equal length', 'weights must not sum to 0', 'negative weights are allowed but unusual'],
  examples: [{ input: { values: [90, 80], weights: [3, 1] }, output: { result: 87.5, weightSum: 4 } }],
  input: z.strictObject({
    values,
    weights: z.array(z.number()).min(1).max(MAX_VALUES).describe('Weights, same length as values.'),
  }),
  output: z.object({ result: z.number(), weightSum: z.number() }),
  execute({ values: xs, weights }) {
    if (xs.length !== weights.length) {
      throw invalidInput(
        `weights must have the same length as values (${xs.length}), received ${weights.length}`,
        'weights',
      );
    }
    let num = new D(0);
    let den = new D(0);
    xs.forEach((x, i) => {
      num = num.plus(new D(x).times(weights[i]!));
      den = den.plus(weights[i]!);
    });
    if (den.isZero()) throw divisionByZero('weights must not sum to 0', 'weights');
    return { result: toNumber(num.div(den)), weightSum: toNumber(den) };
  },
});

function extreme(xs: readonly number[], pick: 'min' | 'max'): { value: number; index: number } {
  let index = 0;
  for (let i = 1; i < xs.length; i++) {
    if (pick === 'min' ? xs[i]! < xs[index]! : xs[i]! > xs[index]!) index = i;
  }
  return { value: Object.is(xs[index], -0) ? 0 : xs[index]!, index };
}

export const min = defineTool({
  name: 'min',
  title: 'Minimum',
  description: 'Returns the smallest number in a list and the index of its first occurrence (0-based).',
  whenToUse: ['smallest of several values'],
  examples: [{ input: { values: [3, -1, 7] }, output: { result: -1, index: 1 } }],
  input: z.strictObject({ values }),
  output: z.object({ result: z.number(), index: z.number().int() }),
  execute({ values: xs }) {
    const { value, index } = extreme(xs, 'min');
    return { result: value, index };
  },
});

export const max = defineTool({
  name: 'max',
  title: 'Maximum',
  description: 'Returns the largest number in a list and the index of its first occurrence (0-based).',
  whenToUse: ['largest of several values'],
  examples: [{ input: { values: [3, -1, 7] }, output: { result: 7, index: 2 } }],
  input: z.strictObject({ values }),
  output: z.object({ result: z.number(), index: z.number().int() }),
  execute({ values: xs }) {
    const { value, index } = extreme(xs, 'max');
    return { result: value, index };
  },
});
