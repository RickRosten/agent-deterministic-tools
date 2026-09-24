import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createRegistry } from '@rickrosten/agent-deterministic-tools-core';
import { statisticsModule } from '@rickrosten/agent-deterministic-tools-statistics';

const registry = createRegistry([statisticsModule]);
const ok = async (tool: string, input: unknown) => {
  const res = await registry.execute<Record<string, unknown>>(`statistics.${tool}`, input);
  if (!res.ok) throw new Error(`${tool} failed: ${JSON.stringify(res.error)}`);
  return res.data;
};
const err = async (tool: string, input: unknown) => {
  const res = await registry.execute(`statistics.${tool}`, input);
  if (res.ok) throw new Error(`${tool} unexpectedly succeeded`);
  return res.error;
};
const result = async (tool: string, input: unknown) => (await ok(tool, input)).result as number;

const data = fc.array(fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e9, max: 1e9 }), { minLength: 2, maxLength: 40 });

describe('statistics module', () => {
  it('exposes all required tools', () => {
    expect(registry.list().map((t) => t.name)).toEqual([
      'statistics.mean',
      'statistics.median',
      'statistics.mode',
      'statistics.variance',
      'statistics.standard_deviation',
      'statistics.percentile',
      'statistics.min',
      'statistics.max',
      'statistics.sum',
    ]);
  });

  it('rejects empty arrays everywhere', async () => {
    for (const t of registry.list()) {
      const input: Record<string, unknown> = { values: [] };
      if (t.name.endsWith('variance') || t.name.endsWith('deviation')) input['kind'] = 'population';
      if (t.name.endsWith('percentile')) input['percentile'] = 50;
      const res = await registry.execute(t.name, input);
      expect(res).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT', field: 'values' } });
    }
  });

  it('rejects NaN / Infinity / non-numbers', async () => {
    expect(await err('mean', { values: [1, Number.NaN] })).toMatchObject({ code: 'INVALID_INPUT', field: 'values[1]' });
    expect(await err('mean', { values: [Number.POSITIVE_INFINITY] })).toMatchObject({ code: 'INVALID_INPUT', field: 'values[0]' });
    expect(await err('median', { values: ['3'] })).toMatchObject({ code: 'INVALID_INPUT', field: 'values[0]' });
  });
});

describe('central tendency', () => {
  it('mean', async () => {
    expect(await ok('mean', { values: [1, 2, 3, 4] })).toEqual({ result: 2.5, count: 4 });
    expect(await result('mean', { values: [0.1, 0.2, 0.3] })).toBe(0.2);
  });
  it('median odd / even / unsorted', async () => {
    expect(await result('median', { values: [3, 1, 2] })).toBe(2);
    expect(await result('median', { values: [5, 1, 3, 2] })).toBe(2.5);
    expect(await result('median', { values: [7] })).toBe(7);
  });
  it('mode', async () => {
    expect(await ok('mode', { values: [1, 2, 2, 3, 3] })).toEqual({ modes: [2, 3], frequency: 2, hasMode: true, count: 5 });
    expect(await ok('mode', { values: [4, 4, 1] })).toMatchObject({ modes: [4], frequency: 2 });
    expect(await ok('mode', { values: [1, 2, 3] })).toEqual({ modes: [], frequency: 1, hasMode: false, count: 3 });
    expect(await ok('mode', { values: [5] })).toMatchObject({ modes: [5], hasMode: true });
  });
});

describe('dispersion', () => {
  const xs = [2, 4, 4, 4, 5, 5, 7, 9];
  it('variance requires explicit kind', async () => {
    expect(await err('variance', { values: xs })).toMatchObject({ code: 'INVALID_INPUT', field: 'kind' });
  });
  it('population vs sample', async () => {
    expect(await ok('variance', { values: xs, kind: 'population' })).toEqual({ result: 4, kind: 'population', count: 8, mean: 5 });
    expect(await result('variance', { values: xs, kind: 'sample' })).toBe(4.571428571428571);
    expect(await ok('standard_deviation', { values: xs, kind: 'population' })).toMatchObject({ result: 2, variance: 4 });
    expect(await result('standard_deviation', { values: xs, kind: 'sample' })).toBe(2.138089935299395);
  });
  it('single value', async () => {
    expect(await result('variance', { values: [3], kind: 'population' })).toBe(0);
    expect(await err('variance', { values: [3], kind: 'sample' })).toMatchObject({ code: 'OUT_OF_RANGE' });
    expect(await err('standard_deviation', { values: [3], kind: 'sample' })).toMatchObject({ code: 'OUT_OF_RANGE' });
  });
  it('regression: catastrophic cancellation does not occur', async () => {
    const big = [1e9 + 4, 1e9 + 7, 1e9 + 13, 1e9 + 16];
    expect(await result('variance', { values: big, kind: 'sample' })).toBe(30);
  });
  it('property: variance >= 0 and sample >= population', async () => {
    await fc.assert(
      fc.asyncProperty(data, async (v) => {
        const pop = await result('variance', { values: v, kind: 'population' });
        const smp = await result('variance', { values: v, kind: 'sample' });
        expect(pop).toBeGreaterThanOrEqual(0);
        expect(smp).toBeGreaterThanOrEqual(pop);
      }),
      { numRuns: 100 },
    );
  });
  it('property: variance is shift invariant', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.integer({ min: -1000, max: 1000 }), { minLength: 2, maxLength: 20 }), fc.integer({ min: -1e6, max: 1e6 }), async (v, c) => {
        const a = await result('variance', { values: v, kind: 'population' });
        const b = await result('variance', { values: v.map((x) => x + c), kind: 'population' });
        expect(b).toBe(a);
      }),
      { numRuns: 100 },
    );
  });
});

describe('percentile', () => {
  const xs = [1, 2, 3, 4];
  it('methods on [1,2,3,4] at p25', async () => {
    const at = (method: string) => result('percentile', { values: xs, percentile: 25, method });
    expect(await at('linear')).toBe(1.75);
    expect(await at('exclusive')).toBe(1.25);
    expect(await at('nearest_rank')).toBe(1);
    expect(await at('lower')).toBe(1);
    expect(await at('higher')).toBe(2);
    expect(await at('midpoint')).toBe(1.5);
    expect(await at('nearest')).toBe(2);
  });
  it('default method is linear and echoed', async () => {
    expect(await ok('percentile', { values: xs, percentile: 50 })).toEqual({ result: 2.5, percentile: 50, method: 'linear', count: 4 });
  });
  it('Excel and Wikipedia reference values', async () => {
    const w = [15, 20, 35, 40, 50];
    expect(await result('percentile', { values: w, percentile: 40 })).toBe(29);
    expect(await result('percentile', { values: w, percentile: 30, method: 'nearest_rank' })).toBe(20);
    expect(await result('percentile', { values: w, percentile: 50, method: 'nearest_rank' })).toBe(35);
    expect(await result('percentile', { values: w, percentile: 100, method: 'nearest_rank' })).toBe(50);
    expect(await result('percentile', { values: w, percentile: 0, method: 'nearest_rank' })).toBe(15);
  });
  it('boundaries', async () => {
    expect(await result('percentile', { values: [9, 1, 5], percentile: 0 })).toBe(1);
    expect(await result('percentile', { values: [9, 1, 5], percentile: 100 })).toBe(9);
    expect(await err('percentile', { values: xs, percentile: 101 })).toMatchObject({ code: 'INVALID_INPUT', field: 'percentile' });
    expect(await err('percentile', { values: xs, percentile: 10, method: 'exclusive' })).toMatchObject({ code: 'OUT_OF_RANGE' });
    expect(await err('percentile', { values: xs, percentile: 50, method: 'R7' })).toMatchObject({ code: 'INVALID_INPUT', field: 'method' });
  });
  it('property: percentile is monotonic and bounded', async () => {
    await fc.assert(
      fc.asyncProperty(data, fc.integer({ min: 0, max: 100 }), fc.integer({ min: 0, max: 100 }), async (v, p1, p2) => {
        const [lo, hi] = p1 <= p2 ? [p1, p2] : [p2, p1];
        const a = await result('percentile', { values: v, percentile: lo });
        const b = await result('percentile', { values: v, percentile: hi });
        expect(a).toBeLessThanOrEqual(b);
        expect(a).toBeGreaterThanOrEqual(Math.min(...v));
        expect(b).toBeLessThanOrEqual(Math.max(...v));
      }),
      { numRuns: 100 },
    );
  });
});

describe('min / max / sum', () => {
  it('known values', async () => {
    expect(await ok('min', { values: [4, 1, 9] })).toEqual({ result: 1, count: 3 });
    expect(await ok('max', { values: [4, 1, 9] })).toEqual({ result: 9, count: 3 });
    expect(await ok('sum', { values: [0.1, 0.2, 0.3] })).toEqual({ result: 0.6, count: 3 });
    expect(await result('min', { values: [-0, 0] })).toBe(0);
  });
  it('regression: sum and mean do not depend on the order of values', async () => {
    const xs = [5e-324, -999999999999.9995, 999999999999.9995];
    for (const v of [xs, [...xs].reverse(), [xs[1]!, xs[0]!, xs[2]!]]) {
      expect(await result('sum', { values: v })).toBe(5e-324);
    }
    expect(await result('mean', { values: [1e308, 3e-300, -1e308] })).toBe(1e-300);
  });
});
