import { defineTool, divisionByZero, z } from '@rickrosten/agent-deterministic-tools-core';
import { D, toNumber } from '../decimal.js';
import { num } from '../schemas.js';

export const percentage = defineTool({
  name: 'percentage',
  title: 'What percent is part of whole',
  description: 'Calculates what percentage `part` is of `whole`: part / whole * 100.',
  whenToUse: ['"what percent of 250 is 40?"', 'share of a total expressed in percent'],
  whenNotToUse: [
    'you need X percent of a value (use math.percentage_of)',
    'you need growth between two values (use math.percentage_change)',
  ],
  limitations: ['whole must be non-zero'],
  examples: [{ input: { part: 40, whole: 250 }, output: { result: 16, unit: 'percent' } }],
  input: z.strictObject({
    part: num('The part value.'),
    whole: num('The total value (denominator). Must be non-zero.'),
  }),
  output: z.object({ result: z.number().describe('Percentage (16 means 16%).'), unit: z.literal('percent') }),
  execute({ part, whole }) {
    if (whole === 0) throw divisionByZero('whole must not be 0', 'whole');
    return { result: toNumber(new D(part).div(whole).times(100)), unit: 'percent' as const };
  },
});

export const percentageOf = defineTool({
  name: 'percentage_of',
  title: 'Percent of a value',
  description: 'Calculates `percent` percent of `value`: value * percent / 100.',
  whenToUse: ['"what is 15% of 80?"', 'tips, discounts or tax amounts given a percent rate'],
  whenNotToUse: ['you need which percent one number is of another (use math.percentage)'],
  examples: [{ input: { percent: 15, value: 80 }, output: { result: 12 } }],
  input: z.strictObject({
    percent: num('Percent to take, e.g. 15 for 15%.'),
    value: num('The base value.'),
  }),
  output: z.object({ result: z.number() }),
  execute({ percent, value }) {
    return { result: toNumber(new D(value).times(percent).div(100)) };
  },
});

export const percentageChange = defineTool({
  name: 'percentage_change',
  title: 'Percentage change',
  description:
    'Calculates relative change from oldValue to newValue in percent: (newValue - oldValue) / |oldValue| * 100.',
  whenToUse: ['growth or decline between two values', '"price went from 50 to 75, what is the change in %?"'],
  whenNotToUse: ['percentage points difference between two percentages (subtract them directly)'],
  limitations: [
    'oldValue must be non-zero',
    'divides by |oldValue| so that a change from a negative base toward zero is reported as an increase',
  ],
  examples: [{ input: { oldValue: 50, newValue: 75 }, output: { result: 50, unit: 'percent', absoluteChange: 25, direction: 'increase' } }],
  input: z.strictObject({
    oldValue: num('Original (reference) value. Must be non-zero.'),
    newValue: num('New value.'),
  }),
  output: z.object({
    result: z.number().describe('Percent change; negative for decrease.'),
    unit: z.literal('percent'),
    absoluteChange: z.number(),
    direction: z.enum(['increase', 'decrease', 'unchanged']),
  }),
  execute({ oldValue, newValue }) {
    if (oldValue === 0) throw divisionByZero('oldValue must not be 0: percentage change from zero is undefined', 'oldValue');
    const diff = new D(newValue).minus(oldValue);
    const pct = diff.div(new D(oldValue).abs()).times(100);
    return {
      result: toNumber(pct),
      unit: 'percent' as const,
      absoluteChange: toNumber(diff),
      direction: diff.isZero() ? ('unchanged' as const) : diff.isPos() ? ('increase' as const) : ('decrease' as const),
    };
  },
});
