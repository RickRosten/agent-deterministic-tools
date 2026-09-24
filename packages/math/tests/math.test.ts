import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createRegistry, type ToolResult } from '@rickrosten/agent-deterministic-tools-core';
import { mathModule } from '@rickrosten/agent-deterministic-tools-math';

const registry = createRegistry([mathModule]);
const run = (tool: string, input: unknown): Promise<ToolResult<Record<string, unknown>>> =>
  registry.execute(`math.${tool}`, input);
const ok = async (tool: string, input: unknown) => {
  const res = await run(tool, input);
  if (!res.ok) throw new Error(`${tool} failed: ${JSON.stringify(res.error)}`);
  return res.data;
};
const errCode = async (tool: string, input: unknown) => {
  const res = await run(tool, input);
  if (res.ok) throw new Error(`${tool} unexpectedly succeeded`);
  return res.error;
};

const finite = fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e12, max: 1e12 });

describe('math module', () => {
  it('exposes all required tools', () => {
    expect(registry.list().map((t) => t.name)).toEqual([
      'math.percentage',
      'math.percentage_of',
      'math.percentage_change',
      'math.ratio',
      'math.proportion',
      'math.average',
      'math.weighted_average',
      'math.sum',
      'math.min',
      'math.max',
      'math.round',
      'math.power',
      'math.root',
    ]);
  });
});

describe('math.percentage', () => {
  it('known values', async () => {
    expect(await ok('percentage', { part: 40, whole: 250 })).toEqual({ result: 16, unit: 'percent' });
    expect(await ok('percentage', { part: 1, whole: 3 })).toMatchObject({ result: 33.333333333333336 });
    expect(await ok('percentage', { part: -5, whole: 20 })).toMatchObject({ result: -25 });
  });
  it('division by zero', async () => {
    expect(await errCode('percentage', { part: 1, whole: 0 })).toMatchObject({ code: 'DIVISION_BY_ZERO', field: 'whole' });
  });
  it('invalid input', async () => {
    expect(await errCode('percentage', { part: 1 })).toMatchObject({ code: 'INVALID_INPUT', field: 'whole' });
    expect(await errCode('percentage', { part: '1', whole: 2 })).toMatchObject({ code: 'INVALID_INPUT', field: 'part' });
  });
});

describe('math.percentage_of', () => {
  it('known values', async () => {
    expect(await ok('percentage_of', { percent: 15, value: 80 })).toEqual({ result: 12 });
    expect(await ok('percentage_of', { percent: 7, value: 0.1 })).toEqual({ result: 0.007 });
    expect(await ok('percentage_of', { percent: 0, value: 123 })).toEqual({ result: 0 });
  });
  it('property: percentage(percentage_of(p, v), v) == p', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: -1000, max: 1000 }), fc.integer({ min: 1, max: 1_000_000 }), async (p, v) => {
        const part = (await ok('percentage_of', { percent: p, value: v })).result as number;
        const back = (await ok('percentage', { part, whole: v })).result as number;
        expect(back).toBeCloseTo(p, 9);
      }),
      { numRuns: 100 },
    );
  });
});

describe('math.percentage_change', () => {
  it('known values', async () => {
    expect(await ok('percentage_change', { oldValue: 50, newValue: 75 })).toEqual({
      result: 50,
      unit: 'percent',
      absoluteChange: 25,
      direction: 'increase',
    });
    expect(await ok('percentage_change', { oldValue: 200, newValue: 150 })).toMatchObject({ result: -25, direction: 'decrease' });
    expect(await ok('percentage_change', { oldValue: 3, newValue: 3 })).toMatchObject({ result: 0, direction: 'unchanged' });
  });
  it('negative base uses absolute denominator', async () => {
    expect(await ok('percentage_change', { oldValue: -100, newValue: -50 })).toMatchObject({ result: 50, direction: 'increase' });
  });
  it('rejects zero base', async () => {
    expect(await errCode('percentage_change', { oldValue: 0, newValue: 5 })).toMatchObject({ code: 'DIVISION_BY_ZERO', field: 'oldValue' });
  });
  it('regression: floating point noise is removed', async () => {
    expect(await ok('percentage_change', { oldValue: 0.1, newValue: 0.3 })).toMatchObject({ result: 200, absoluteChange: 0.2 });
  });
});

describe('math.ratio', () => {
  it('reduces ratios', async () => {
    expect(await ok('ratio', { a: 1920, b: 1080 })).toEqual({
      result: 1.7777777777777777,
      antecedent: '16',
      consequent: '9',
      formatted: '16:9',
    });
    expect(await ok('ratio', { a: 1.5, b: 0.5 })).toMatchObject({ result: 3, formatted: '3:1' });
    expect(await ok('ratio', { a: 3, b: -6 })).toMatchObject({ result: -0.5, formatted: '-1:2' });
    expect(await ok('ratio', { a: 0, b: 5 })).toMatchObject({ result: 0, formatted: '0:1' });
  });
  it('does not reduce inputs with too many decimals', async () => {
    expect(await ok('ratio', { a: Math.PI, b: 1 })).toMatchObject({ formatted: null });
  });
  it('division by zero', async () => {
    expect(await errCode('ratio', { a: 1, b: 0 })).toMatchObject({ code: 'DIVISION_BY_ZERO' });
  });
});

describe('math.proportion', () => {
  it('solves each term', async () => {
    expect(await ok('proportion', { a: 3, b: 4.5, c: 7 })).toMatchObject({ result: 10.5, solvedFor: 'd' });
    expect(await ok('proportion', { b: 4, c: 6, d: 8 })).toMatchObject({ result: 3, solvedFor: 'a' });
    expect(await ok('proportion', { a: 3, c: 6, d: 8 })).toMatchObject({ result: 4, solvedFor: 'b' });
    expect(await ok('proportion', { a: 3, b: 4, d: 8 })).toMatchObject({ result: 6, solvedFor: 'c', a: 3, b: 4, d: 8 });
  });
  it('requires exactly one missing term', async () => {
    expect(await errCode('proportion', { a: 1, b: 2, c: 3, d: 4 })).toMatchObject({ code: 'INVALID_INPUT' });
    expect(await errCode('proportion', { a: 1, b: 2 })).toMatchObject({ code: 'INVALID_INPUT' });
  });
  it('rejects zero denominators', async () => {
    expect(await errCode('proportion', { a: 1, b: 0, c: 3 })).toMatchObject({ code: 'DIVISION_BY_ZERO', field: 'b' });
    expect(await errCode('proportion', { a: 0, b: 2, c: 3 })).toMatchObject({ code: 'DIVISION_BY_ZERO', field: 'a' });
  });
});

describe('math.sum / average / weighted_average', () => {
  it('sums without floating-point drift', async () => {
    expect(await ok('sum', { values: [0.1, 0.2] })).toEqual({ result: 0.3, count: 2 });
    expect(await ok('sum', { values: [1e16, 1, -1e16] })).toEqual({ result: 1, count: 3 });
  });
  it('regression: tiny addends survive cancellation in every order', async () => {
    const xs = [5e-324, -999999999999.9995, 999999999999.9995];
    for (const order of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
      expect((await ok('sum', { values: order.map((i) => xs[i]!) })).result).toBe(5e-324);
    }
    expect((await ok('sum', { values: [1e308, 1e-300, -1e308] })).result).toBe(1e-300);
    expect((await ok('weighted_average', { values: [1e-300, 1e15, -1e15], weights: [1, 1, 1] })).result).toBe(3.3333333333333334e-301);
  });
  it('averages', async () => {
    expect(await ok('average', { values: [2, 4, 9] })).toEqual({ result: 5, count: 3, sum: 15 });
    expect(await ok('average', { values: [0.1, 0.2, 0.3] })).toMatchObject({ result: 0.2 });
  });
  it('weighted averages', async () => {
    expect(await ok('weighted_average', { values: [90, 80], weights: [3, 1] })).toEqual({ result: 87.5, weightSum: 4 });
    expect(await errCode('weighted_average', { values: [1, 2], weights: [1] })).toMatchObject({ code: 'INVALID_INPUT', field: 'weights' });
    expect(await errCode('weighted_average', { values: [1, 2], weights: [1, -1] })).toMatchObject({ code: 'DIVISION_BY_ZERO' });
  });
  it('rejects empty arrays and non-numbers', async () => {
    expect(await errCode('sum', { values: [] })).toMatchObject({ code: 'INVALID_INPUT', field: 'values' });
    expect(await errCode('average', { values: [1, 'x'] })).toMatchObject({ code: 'INVALID_INPUT', field: 'values[1]' });
    expect(await errCode('average', { values: [1, null] })).toMatchObject({ code: 'INVALID_INPUT' });
  });
  it('property: sum is order independent', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(finite, { minLength: 1, maxLength: 30 }), async (xs) => {
        const a = (await ok('sum', { values: xs })).result;
        const b = (await ok('sum', { values: [...xs].reverse() })).result;
        expect(a).toBe(b);
      }),
      { numRuns: 100 },
    );
  });
  it('property: min <= average <= max', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(finite, { minLength: 1, maxLength: 30 }), async (xs) => {
        const avg = (await ok('average', { values: xs })).result as number;
        const lo = (await ok('min', { values: xs })).result as number;
        const hi = (await ok('max', { values: xs })).result as number;
        expect(lo).toBeLessThanOrEqual(avg);
        expect(avg).toBeLessThanOrEqual(hi);
      }),
      { numRuns: 100 },
    );
  });
});

describe('math.min / math.max', () => {
  it('returns value and first index', async () => {
    expect(await ok('min', { values: [3, -1, 7, -1] })).toEqual({ result: -1, index: 1 });
    expect(await ok('max', { values: [3, 7, 7] })).toEqual({ result: 7, index: 1 });
    expect(await ok('max', { values: [42] })).toEqual({ result: 42, index: 0 });
  });
});

describe('math.round', () => {
  it('rounds decimal representation', async () => {
    expect(await ok('round', { value: 2.675, decimals: 2 })).toEqual({ result: 2.68, decimals: 2, mode: 'half_up' });
    expect(await ok('round', { value: 1.005, decimals: 2 })).toMatchObject({ result: 1.01 });
  });
  it('supports modes', async () => {
    expect(await ok('round', { value: 2.5, mode: 'half_even' })).toMatchObject({ result: 2 });
    expect(await ok('round', { value: 3.5, mode: 'half_even' })).toMatchObject({ result: 4 });
    expect(await ok('round', { value: -2.5, mode: 'half_up' })).toMatchObject({ result: -3 });
    expect(await ok('round', { value: -2.5, mode: 'half_down' })).toMatchObject({ result: -2 });
    expect(await ok('round', { value: 2.1, mode: 'up' })).toMatchObject({ result: 3 });
    expect(await ok('round', { value: -2.9, mode: 'down' })).toMatchObject({ result: -2 });
    expect(await ok('round', { value: -2.1, mode: 'ceil' })).toMatchObject({ result: -2 });
    expect(await ok('round', { value: -2.1, mode: 'floor' })).toMatchObject({ result: -3 });
  });
  it('supports negative decimals', async () => {
    expect(await ok('round', { value: 1234.5, decimals: -2 })).toMatchObject({ result: 1200 });
    expect(await ok('round', { value: 1250, decimals: -2, mode: 'half_even' })).toMatchObject({ result: 1200 });
  });
  it('validates decimals and mode', async () => {
    expect(await errCode('round', { value: 1, decimals: 1.5 })).toMatchObject({ code: 'INVALID_INPUT', field: 'decimals' });
    expect(await errCode('round', { value: 1, decimals: 99 })).toMatchObject({ code: 'INVALID_INPUT' });
    expect(await errCode('round', { value: 1, mode: 'banker' })).toMatchObject({ code: 'INVALID_INPUT', field: 'mode' });
  });
  it('property: rounding is idempotent', async () => {
    await fc.assert(
      fc.asyncProperty(finite, fc.integer({ min: 0, max: 8 }), async (v, d) => {
        const once = (await ok('round', { value: v, decimals: d })).result;
        const twice = (await ok('round', { value: once, decimals: d })).result;
        expect(twice).toBe(once);
      }),
      { numRuns: 100 },
    );
  });
});

describe('math.power / math.root', () => {
  it('known values', async () => {
    expect(await ok('power', { base: 2, exponent: 10 })).toEqual({ result: 1024 });
    expect(await ok('power', { base: 1.05, exponent: 10 })).toEqual({ result: 1.6288946267774413 });
    expect(await ok('power', { base: 4, exponent: 0.5 })).toEqual({ result: 2 });
    expect(await ok('power', { base: -2, exponent: 3 })).toEqual({ result: -8 });
    expect(await ok('power', { base: 2, exponent: -2 })).toEqual({ result: 0.25 });
    expect(await ok('root', { value: 27, degree: 3 })).toEqual({ result: 3, degree: 3 });
    expect(await ok('root', { value: 2 })).toEqual({ result: Math.SQRT2, degree: 2 });
    expect(await ok('root', { value: -32, degree: 5 })).toEqual({ result: -2, degree: 5 });
    expect(await ok('root', { value: 1024, degree: 10 })).toEqual({ result: 2, degree: 10 });
  });
  it('edge cases', async () => {
    expect(await errCode('power', { base: 0, exponent: -1 })).toMatchObject({ code: 'DIVISION_BY_ZERO' });
    expect(await errCode('power', { base: -8, exponent: 1 / 3 })).toMatchObject({ code: 'OUT_OF_RANGE' });
    expect(await errCode('power', { base: 10, exponent: 400 })).toMatchObject({ code: 'OUT_OF_RANGE' });
    expect(await errCode('root', { value: -4, degree: 2 })).toMatchObject({ code: 'OUT_OF_RANGE', field: 'value' });
    expect(await errCode('root', { value: 4, degree: 0 })).toMatchObject({ code: 'INVALID_INPUT', field: 'degree' });
  });
  it('property: root(power(x, n), n) == |x| for even n', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: -1000, max: 1000 }), fc.constantFrom(2, 4, 6), async (x, n) => {
        const p = (await ok('power', { base: x, exponent: n })).result as number;
        const r = (await ok('root', { value: p, degree: n })).result as number;
        expect(r).toBeCloseTo(Math.abs(x), 9);
      }),
      { numRuns: 100 },
    );
  });
});
