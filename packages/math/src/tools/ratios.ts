import { defineTool, divisionByZero, invalidInput, z } from '@rickrosten/agent-deterministic-tools-core';
import { D, toNumber, type Dec } from '../decimal.js';
import { num } from '../schemas.js';

const MAX_SIMPLIFY_DECIMALS = 10;

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
}

/** Scales two decimals to integers and reduces them; undefined if too many decimals. */
function simplify(a: Dec, b: Dec): [string, string] | undefined {
  const scale = Math.max(a.decimalPlaces(), b.decimalPlaces());
  if (scale > MAX_SIMPLIFY_DECIMALS) return undefined;
  const factor = new D(10).pow(scale);
  const ia = BigInt(a.times(factor).toFixed(0));
  const ib = BigInt(b.times(factor).toFixed(0));
  const g = gcd(ia, ib);
  if (g === 0n) return undefined;
  return [(ia / g).toString(), (ib / g).toString()];
}

export const ratio = defineTool({
  name: 'ratio',
  title: 'Ratio of two numbers',
  description: 'Calculates the ratio a:b as a quotient (a / b) and as a reduced integer ratio when possible.',
  whenToUse: ['"what is the ratio of 1920 to 1080?"', 'simplify a ratio like 150:100 to 3:2'],
  whenNotToUse: ['solving for a missing term of a proportion (use math.proportion)'],
  limitations: [
    'b must be non-zero',
    `reduced ratio is only produced for inputs with at most ${MAX_SIMPLIFY_DECIMALS} decimal places`,
  ],
  examples: [{ input: { a: 1920, b: 1080 }, output: { result: 1.7777777777777777, antecedent: '16', consequent: '9', formatted: '16:9' } }],
  input: z.strictObject({ a: num('First term (antecedent).'), b: num('Second term (consequent). Must be non-zero.') }),
  output: z.object({
    result: z.number().describe('a / b'),
    antecedent: z.string().nullable().describe('Reduced integer first term, as a string to avoid precision loss.'),
    consequent: z.string().nullable(),
    formatted: z.string().nullable().describe('Reduced ratio "x:y", or null if not reducible to integers.'),
  }),
  execute({ a, b }) {
    if (b === 0) throw divisionByZero('b must not be 0', 'b');
    const da = new D(a);
    const db = new D(b);
    const reduced = simplify(da, db);
    let antecedent: string | null = null;
    let consequent: string | null = null;
    if (reduced) {
      [antecedent, consequent] = reduced;
      if (consequent.startsWith('-')) {
        antecedent = antecedent.startsWith('-') ? antecedent.slice(1) : `-${antecedent}`;
        consequent = consequent.slice(1);
      }
    }
    return {
      result: toNumber(da.div(db)),
      antecedent,
      consequent,
      formatted: antecedent !== null && consequent !== null ? `${antecedent}:${consequent}` : null,
    };
  },
});

const TERMS = ['a', 'b', 'c', 'd'] as const;
type Term = (typeof TERMS)[number];

export const proportion = defineTool({
  name: 'proportion',
  title: 'Solve a proportion',
  description:
    'Solves the proportion a / b = c / d for the single missing term. Provide exactly three of a, b, c, d; omit the unknown one.',
  whenToUse: [
    'rule of three: "3 apples cost 4.50, how much do 7 cost?" -> a=3, b=4.5, c=7, solve d',
    'scaling recipes or maps with a fixed ratio',
  ],
  whenNotToUse: ['inverse proportionality (x * y = const)', 'just dividing two numbers (use math.ratio)'],
  limitations: ['exactly one term must be omitted', 'terms used as denominators in the solved form must be non-zero'],
  examples: [{ input: { a: 3, b: 4.5, c: 7 }, output: { result: 10.5, solvedFor: 'd' } }],
  input: z.strictObject({
    a: num('Numerator of the left fraction.').optional(),
    b: num('Denominator of the left fraction.').optional(),
    c: num('Numerator of the right fraction.').optional(),
    d: num('Denominator of the right fraction.').optional(),
  }),
  output: z.object({
    result: z.number().describe('Value of the missing term.'),
    solvedFor: z.enum(TERMS),
    a: z.number(),
    b: z.number(),
    c: z.number(),
    d: z.number(),
  }),
  execute(input) {
    const missing = TERMS.filter((t) => input[t] === undefined);
    if (missing.length !== 1) {
      throw invalidInput(
        `Provide exactly three of a, b, c, d (omit only the unknown term); ${missing.length === 0 ? 'none' : missing.length} omitted`,
        missing[0],
      );
    }
    const unknown = missing[0] as Term;
    for (const denominator of ['b', 'd'] as const) {
      if (input[denominator] === 0) throw divisionByZero(`${denominator} is a denominator and must not be 0`, denominator);
    }
    const v = (t: Term) => new D(input[t]!);
    let result: Dec;
    // a/b = c/d  =>  a*d = b*c
    switch (unknown) {
      case 'a':
        if (input.d === 0) throw divisionByZero('d must not be 0 when solving for a', 'd');
        result = v('b').times(v('c')).div(v('d'));
        break;
      case 'b':
        if (input.c === 0) throw divisionByZero('c must not be 0 when solving for b', 'c');
        result = v('a').times(v('d')).div(v('c'));
        break;
      case 'c':
        if (input.b === 0) throw divisionByZero('b must not be 0 when solving for c', 'b');
        result = v('a').times(v('d')).div(v('b'));
        break;
      case 'd':
        if (input.a === 0) throw divisionByZero('a must not be 0 when solving for d', 'a');
        result = v('b').times(v('c')).div(v('a'));
        break;
    }
    const value = toNumber(result);
    const terms = { a: input.a, b: input.b, c: input.c, d: input.d, [unknown]: value } as Record<Term, number>;
    return { result: value, solvedFor: unknown, ...terms };
  },
});
