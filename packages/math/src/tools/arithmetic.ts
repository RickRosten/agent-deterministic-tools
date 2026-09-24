import { defineTool, divisionByZero, outOfRange, z } from '@rickrosten/agent-deterministic-tools-core';
import { D, ROUNDING_MODE_MAP, ROUNDING_MODES, toNumber } from '../decimal.js';
import { num } from '../schemas.js';

export const round = defineTool({
  name: 'round',
  title: 'Round a number',
  description:
    'Rounds a number to a number of decimal places using an explicit rounding mode. Operates on the decimal representation, so 2.675 rounds to 2.68 with half_up (unlike binary floating point).',
  whenToUse: ['rounding to N decimals', 'rounding to tens/hundreds with negative decimals (-1, -2)'],
  whenNotToUse: ['money amounts inside financial calculations (finance tools round themselves)'],
  limitations: [
    'decimals must be an integer between -15 and 15',
    'modes: half_up (half away from zero), half_even (banker\'s), half_down (half toward zero), up (away from zero), down (toward zero/truncate), ceil (toward +infinity), floor (toward -infinity)',
  ],
  examples: [{ input: { value: 2.675, decimals: 2, mode: 'half_up' }, output: { result: 2.68, decimals: 2, mode: 'half_up' } }],
  input: z.strictObject({
    value: num('Number to round.'),
    decimals: z.number().int().min(-15).max(15).default(0).describe('Decimal places (negative rounds to tens, hundreds, ...). Default 0.'),
    mode: z.enum(ROUNDING_MODES).default('half_up').describe('Rounding mode. Default half_up (half away from zero).'),
  }),
  output: z.object({ result: z.number(), decimals: z.number().int(), mode: z.enum(ROUNDING_MODES) }),
  execute({ value, decimals, mode }) {
    const rounding = ROUNDING_MODE_MAP[mode];
    const v = new D(value);
    const rounded =
      decimals >= 0
        ? v.toDecimalPlaces(decimals, rounding)
        : v.div(new D(10).pow(-decimals)).toDecimalPlaces(0, rounding).times(new D(10).pow(-decimals));
    return { result: toNumber(rounded), decimals, mode };
  },
});

export const power = defineTool({
  name: 'power',
  title: 'Exponentiation',
  description: 'Raises base to exponent (base^exponent), computed with 40 significant digits and rounded once.',
  whenToUse: ['squares, cubes, arbitrary powers', 'growth factors like 1.05^10'],
  whenNotToUse: ['compound interest with compounding conventions (use finance.compound_interest)', 'roots (use math.root)'],
  limitations: [
    'negative base with non-integer exponent is not a real number (OUT_OF_RANGE)',
    '0 raised to a negative exponent is DIVISION_BY_ZERO',
    'results beyond ±1.79e308 are OUT_OF_RANGE',
  ],
  examples: [{ input: { base: 1.05, exponent: 10 }, output: { result: 1.6288946267774413 } }],
  input: z.strictObject({ base: num('Base.'), exponent: num('Exponent.') }),
  output: z.object({ result: z.number() }),
  execute({ base, exponent }) {
    if (base === 0 && exponent < 0) throw divisionByZero('0 cannot be raised to a negative exponent', 'base');
    if (base < 0 && !Number.isInteger(exponent)) {
      throw outOfRange('a negative base with a non-integer exponent has no real result', 'exponent');
    }
    return { result: toNumber(new D(base).pow(exponent)) };
  },
});

export const root = defineTool({
  name: 'root',
  title: 'n-th root',
  description: 'Calculates the real n-th root of a value (degree 2 = square root, 3 = cube root).',
  whenToUse: ['square roots, cube roots, n-th roots'],
  whenNotToUse: ['fractional powers in general (use math.power)'],
  limitations: [
    'degree must be an integer from 1 to 1000',
    'even roots of negative numbers have no real result (OUT_OF_RANGE)',
    'odd roots of negative numbers return the negative real root',
  ],
  examples: [{ input: { value: 27, degree: 3 }, output: { result: 3, degree: 3 } }],
  input: z.strictObject({
    value: num('Radicand.'),
    degree: z.number().int().min(1).max(1000).default(2).describe('Root degree. Default 2 (square root).'),
  }),
  output: z.object({ result: z.number(), degree: z.number().int() }),
  execute({ value, degree }) {
    if (value < 0 && degree % 2 === 0) {
      throw outOfRange(`even root (degree ${degree}) of a negative number has no real result`, 'value');
    }
    const v = new D(value);
    let r;
    if (degree === 2) r = v.sqrt();
    else if (degree === 3) r = v.cbrt();
    else r = v.abs().pow(new D(1).div(degree)).times(value < 0 ? -1 : 1);
    return { result: toNumber(r), degree };
  },
});
