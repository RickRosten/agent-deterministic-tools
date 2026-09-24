import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createRegistry } from '@rickrosten/agent-deterministic-tools-core';
import { CATEGORIES, UNITS, unitsModule } from '@rickrosten/agent-deterministic-tools-units';

const registry = createRegistry([unitsModule]);
const convert = async (value: number, from: string, to: string, extra: Record<string, unknown> = {}) => {
  const res = await registry.execute<Record<string, unknown>>('units.convert', { value, from, to, ...extra });
  if (!res.ok) throw new Error(JSON.stringify(res.error));
  return res.data;
};
const result = async (value: number, from: string, to: string) => (await convert(value, from, to)).result;
const err = async (input: unknown) => {
  const res = await registry.execute('units.convert', input);
  if (res.ok) throw new Error(`unexpected success ${JSON.stringify(res.data)}`);
  return res.error;
};

describe('catalog', () => {
  it('covers all required categories with several units each', () => {
    expect(CATEGORIES).toEqual(['length', 'mass', 'temperature', 'area', 'volume', 'speed', 'time', 'energy', 'power', 'pressure', 'data']);
    for (const c of CATEGORIES) expect(UNITS.filter((u) => u.category === c).length, c).toBeGreaterThanOrEqual(4);
  });
});

describe('units.convert known values', () => {
  it('spec example: 100 km/h to m/s', async () => {
    expect(await convert(100, 'km/h', 'm/s')).toEqual({
      result: 27.77777777777778,
      resultDecimal: '27.7777777777777777777777777778',
      value: 100,
      from: { id: 'km/h', name: 'kilometre per hour' },
      to: { id: 'm/s', name: 'metre per second' },
      category: 'speed',
      significantDigits: null,
    });
  });
  it('length / mass / area / volume', async () => {
    expect(await result(1, 'mi', 'km')).toBe(1.609344);
    expect(await result(1, 'in', 'cm')).toBe(2.54);
    expect(await result(10, 'ft', 'm')).toBe(3.048);
    expect(await result(1, 'lb', 'kg')).toBe(0.45359237);
    expect(await result(1, 'kg', 'lb')).toBe(2.2046226218487757);
    expect(await result(1, 'st', 'lb')).toBe(14);
    expect(await result(1, 'acre', 'm²')).toBe(4046.8564224);
    expect(await result(1, 'ha', 'acres')).toBe(2.4710538146716536);
    expect(await result(1, 'gal_us', 'L')).toBe(3.785411784);
    expect(await result(1, 'gal_imp', 'gal_us')).toBe(1.200949925504855);
  });
  it('temperature is affine and exact', async () => {
    expect(await result(0, '°C', 'K')).toBe(273.15);
    expect(await result(100, '°C', '°F')).toBe(212);
    expect(await result(-40, 'C', 'F')).toBe(-40);
    expect(await result(72, '°F', '°C')).toBe(22.22222222222222);
    expect(await result(491.67, '°R', '°F')).toBe(32);
    expect(await result(0, 'K', '°C')).toBe(-273.15);
  });
  it('time / energy / power / pressure', async () => {
    expect(await result(90, 'min', 'h')).toBe(1.5);
    expect(await result(1, 'wk', 's')).toBe(604800);
    expect(await result(1, 'kWh', 'J')).toBe(3600000);
    expect(await result(1, 'kcal', 'kJ')).toBe(4.184);
    expect(await result(1, 'Cal', 'cal')).toBe(1000);
    expect(await result(1, 'hp', 'W')).toBe(745.6998715822702);
    expect(await result(1, 'PS', 'kW')).toBe(0.73549875);
    expect(await result(1, 'atm', 'Pa')).toBe(101325);
    expect(await result(1, 'bar', 'psi')).toBe(14.503773773020923);
    expect(await result(760, 'Torr', 'atm')).toBe(1);
  });
  it('data: SI vs IEC and bits vs bytes', async () => {
    expect(await result(1, 'GiB', 'MB')).toBe(1073.741824);
    expect(await result(1, 'KiB', 'B')).toBe(1024);
    expect(await result(1, 'kB', 'B')).toBe(1000);
    expect(await result(100, 'Mbit', 'MB')).toBe(12.5);
    expect(await result(8, 'bit', 'B')).toBe(1);
  });
});

describe('aliases and normalization', () => {
  it('accepts names, plurals and unicode forms', async () => {
    expect(await result(1, 'square feet', 'm^2')).toBe(0.09290304);
    expect(await result(1, 'kilometers per hour', 'km / h')).toBe(1);
    expect(await result(20, '℃', 'kelvin')).toBe(293.15);
    expect(await result(1, 'μm', 'nm')).toBe(1000);
    expect(await result(1, 'µm', 'nm')).toBe(1000);
    expect(await result(3, 'feet', 'inches')).toBe(36);
    expect(await result(1, 'KPH', 'kph')).toBe(1);
  });
  it('is case-sensitive where it matters', async () => {
    expect((await convert(1, 'MB', 'kB')).from).toMatchObject({ id: 'MB' });
    expect((await convert(1, 'Mb', 'kbit')).from).toMatchObject({ id: 'Mbit' });
    expect((await convert(1, 'mb', 'Pa')).from).toMatchObject({ id: 'mbar' });
    expect((await convert(1, 'Nm', 'm').catch(() => null))).toBeNull();
  });
  it('rejects ambiguous symbols with alternatives', async () => {
    const e = await err({ value: 1, from: 'gal', to: 'L' });
    expect(e).toMatchObject({ code: 'INVALID_UNIT', field: 'from', details: { candidates: ['gal_us', 'gal_imp'] } });
    expect(e.message).toContain('gal_us (US gallon)');
    expect(await err({ value: 1, from: 'KB', to: 'B' })).toMatchObject({ code: 'INVALID_UNIT', details: { candidates: ['kB', 'KiB'] } });
    expect(await err({ value: 1, from: 't', to: 'ton' })).toMatchObject({ code: 'INVALID_UNIT', field: 'to' });
    expect(await err({ value: 1, from: 'year', to: 'd' })).toMatchObject({ code: 'INVALID_UNIT' });
  });
  it('suggests close matches for unknown units', async () => {
    const e = await err({ value: 1, from: 'kilometerz', to: 'm' });
    expect(e).toMatchObject({ code: 'INVALID_UNIT', field: 'from' });
    expect((e.details as { suggestions: string[] }).suggestions).toContain('km');
  });
});

describe('errors', () => {
  it('cross-category conversion', async () => {
    expect(await err({ value: 1, from: 'km', to: 'kg' })).toMatchObject({ code: 'INVALID_UNIT', field: 'to' });
  });
  it('below absolute zero', async () => {
    expect(await err({ value: -300, from: '°C', to: 'K' })).toMatchObject({ code: 'OUT_OF_RANGE', field: 'value' });
  });
  it('invalid input', async () => {
    expect(await err({ value: '1', from: 'm', to: 'km' })).toMatchObject({ code: 'INVALID_INPUT', field: 'value' });
    expect(await err({ value: 1, from: '', to: 'km' })).toMatchObject({ code: 'INVALID_INPUT', field: 'from' });
  });
});

describe('precision', () => {
  it('significantDigits rounding', async () => {
    expect(await convert(100, 'km/h', 'm/s', { significantDigits: 4 })).toMatchObject({ result: 27.78, resultDecimal: '27.78', significantDigits: 4 });
  });
  it('property: round trip returns the original value', async () => {
    const pairs = CATEGORIES.map((c) => UNITS.filter((u) => u.category === c).map((u) => u.id));
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...pairs).chain((ids) => fc.tuple(fc.constantFrom(...ids), fc.constantFrom(...ids))),
        fc.double({ min: 0.001, max: 1e9, noNaN: true }),
        async ([a, b], v) => {
          const there = await convert(v, a, b);
          const back = await convert(Number(there.resultDecimal), b, a, { significantDigits: 12 });
          expect(back.result).toBeCloseTo(Number(v.toPrecision(12)), 6);
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('units.list_units', () => {
  it('lists categories and ambiguous symbols', async () => {
    const res = await registry.execute<{ categories: Array<{ category: string; baseUnit: string; units: unknown[] }>; ambiguous: Record<string, string[]> }>(
      'units.list_units',
      { category: 'volume' },
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.categories).toHaveLength(1);
      expect(res.data.categories[0]).toMatchObject({ category: 'volume', baseUnit: 'm³' });
      expect(res.data.ambiguous['gal']).toEqual(['gal_us', 'gal_imp']);
      expect(res.data.ambiguous['KB']).toBeUndefined();
    }
  });
});
