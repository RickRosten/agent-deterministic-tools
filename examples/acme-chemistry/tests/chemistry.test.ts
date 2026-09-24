import { describe, expect, it } from 'vitest';
import { createRegistry } from '@rickrosten/agent-deterministic-tools-core';
import chemistry, { parseFormula } from '@acme/chemistry';

const registry = createRegistry([chemistry]);
const ok = async (tool: string, input: unknown) => {
  const res = await registry.execute<Record<string, unknown>>(`chemistry.${tool}`, input);
  if (!res.ok) throw new Error(JSON.stringify(res.error));
  return res.data;
};
const err = async (tool: string, input: unknown) => {
  const res = await registry.execute(`chemistry.${tool}`, input);
  if (res.ok) throw new Error('unexpected success');
  return res.error;
};

describe('formula parser', () => {
  it('handles groups and hydrates', () => {
    expect(Object.fromEntries(parseFormula('Ca(OH)2'))).toEqual({ Ca: 1, O: 2, H: 2 });
    expect(Object.fromEntries(parseFormula('K4[Fe(CN)6]'))).toEqual({ K: 4, Fe: 1, C: 6, N: 6 });
    expect(Object.fromEntries(parseFormula('CuSO4·5H2O'))).toEqual({ Cu: 1, S: 1, O: 9, H: 10 });
  });
});

describe('chemistry.molar_mass', () => {
  it('known values', async () => {
    expect(await ok('molar_mass', { formula: 'H2O' })).toMatchObject({ result: 18.015, unit: 'g/mol' });
    expect((await ok('molar_mass', { formula: 'NaCl' })).result).toBe(58.44);
    expect((await ok('molar_mass', { formula: 'C6H12O6' })).result).toBe(180.156);
    expect((await ok('molar_mass', { formula: 'Ca(OH)2' })).result).toBe(74.092);
    expect((await ok('molar_mass', { formula: 'CuSO4·5H2O' })).result).toBe(249.677);
    expect((await ok('molar_mass', { formula: 'K4[Fe(CN)6]' })).result).toBe(368.345);
  });
  it('composition sums to 100%', async () => {
    const r = await ok('molar_mass', { formula: 'C6H12O6' });
    const total = (r.composition as Array<{ massPercent: number }>).reduce((s, c) => s + c.massPercent, 0);
    expect(total).toBeCloseTo(100, 2);
  });
  it('rejects invalid formulas', async () => {
    expect(await err('molar_mass', { formula: 'Xx2' })).toMatchObject({ code: 'INVALID_INPUT', field: 'formula' });
    expect(await err('molar_mass', { formula: 'Ca(OH' })).toMatchObject({ code: 'INVALID_INPUT' });
    expect(await err('molar_mass', { formula: 'H2O; rm -rf /' })).toMatchObject({ code: 'INVALID_INPUT' });
    expect(await err('molar_mass', { formula: '' })).toMatchObject({ code: 'INVALID_INPUT' });
  });
  it('is case-sensitive', async () => {
    expect((await ok('molar_mass', { formula: 'Co' })).result).toBe(58.933);
    expect((await ok('molar_mass', { formula: 'CO' })).result).toBe(28.01);
  });
});

describe('chemistry.molarity', () => {
  it('from mass and from moles', async () => {
    expect(await ok('molarity', { massGrams: 5.844, formula: 'NaCl', volumeLiters: 1 })).toMatchObject({ result: 0.1, moles: 0.1 });
    expect(await ok('molarity', { moles: 0.5, volumeLiters: 0.25 })).toMatchObject({ result: 2, molarMass: null });
  });
  it('validates amount input', async () => {
    expect(await err('molarity', { volumeLiters: 1 })).toMatchObject({ code: 'INVALID_INPUT' });
    expect(await err('molarity', { massGrams: 1, volumeLiters: 1 })).toMatchObject({ field: 'formula' });
    expect(await err('molarity', { moles: 1, volumeLiters: 0 })).toMatchObject({ field: 'volumeLiters' });
  });
});

describe('chemistry.dilution', () => {
  it('solves each term', async () => {
    expect(await ok('dilution', { c1: 2, c2: 0.5, v2: 200 })).toEqual({ result: 50, solvedFor: 'v1' });
    expect(await ok('dilution', { v1: 50, c2: 0.5, v2: 200 })).toEqual({ result: 2, solvedFor: 'c1' });
    expect(await ok('dilution', { c1: 2, v1: 50, v2: 200 })).toEqual({ result: 0.5, solvedFor: 'c2' });
    expect(await ok('dilution', { c1: 2, v1: 50, c2: 0.5 })).toEqual({ result: 200, solvedFor: 'v2' });
  });
  it('requires exactly one unknown', async () => {
    expect(await err('dilution', { c1: 2, v1: 50, c2: 0.5, v2: 200 })).toMatchObject({ code: 'INVALID_INPUT' });
  });
});
