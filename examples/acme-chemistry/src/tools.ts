import { defineTool, divisionByZero, invalidInput, z } from '@rickrosten/agent-deterministic-tools-core';
import { MAX_FORMULA_LENGTH, molarMass as computeMolarMass } from './formula.js';

const formula = z
  .string()
  .min(1)
  .max(MAX_FORMULA_LENGTH)
  .describe('Chemical formula with case-sensitive element symbols, e.g. "H2O", "Ca(OH)2", "CuSO4·5H2O".');

export const molarMass = defineTool({
  name: 'molar_mass',
  title: 'Molar mass',
  description: 'Molar mass (g/mol) of a chemical formula and its elemental mass composition, using IUPAC 2021 abridged atomic weights.',
  whenToUse: ['"molar mass of glucose C6H12O6"', 'mass percent of an element in a compound'],
  whenNotToUse: ['isotopic or exact monoisotopic masses'],
  limitations: [
    'element symbols are case-sensitive (Co = cobalt, CO = carbon monoxide)',
    'supports (), [], {} groups and hydrates with "·", "." or "*"; charges and isotopes are not supported',
    'result rounded to 3 decimals',
  ],
  examples: [{ input: { formula: 'H2O' }, output: { result: 18.015, unit: 'g/mol' } }],
  input: z.strictObject({ formula }),
  output: z.object({
    result: z.number(),
    unit: z.literal('g/mol'),
    composition: z.array(z.object({ element: z.string(), count: z.number().int(), mass: z.number(), massPercent: z.number() })),
  }),
  execute({ formula: f }) {
    const { molarMass: result, composition } = computeMolarMass(f);
    return { result, unit: 'g/mol' as const, composition };
  },
});

export const molarity = defineTool({
  name: 'molarity',
  title: 'Molarity',
  description: 'Molar concentration (mol/L) of a solution: moles of solute / litres of solution. The solute can be given in moles, or as a mass plus formula.',
  whenToUse: ['"5.844 g NaCl dissolved to 1 L, what is the molarity?"'],
  whenNotToUse: ['molality (mol per kg of solvent)', 'diluting an existing solution (use chemistry.dilution)'],
  limitations: ['provide either `moles`, or `massGrams` together with `formula`', 'volumeLiters is the final solution volume'],
  examples: [{ input: { massGrams: 5.844, formula: 'NaCl', volumeLiters: 1 }, output: { result: 0.1, unit: 'mol/L' } }],
  input: z.strictObject({
    moles: z.number().positive().optional().describe('Amount of solute in mol.'),
    massGrams: z.number().positive().optional().describe('Mass of solute in grams (requires formula).'),
    formula: formula.optional(),
    volumeLiters: z.number().positive().describe('Solution volume in litres.'),
  }),
  output: z.object({ result: z.number(), unit: z.literal('mol/L'), moles: z.number(), molarMass: z.number().nullable() }),
  execute(input) {
    const byMass = input.massGrams !== undefined;
    if ((input.moles !== undefined) === byMass) throw invalidInput('provide exactly one of `moles` or `massGrams`', 'moles');
    if (byMass && !input.formula) throw invalidInput('formula is required when massGrams is given', 'formula');
    const mm = byMass ? computeMolarMass(input.formula!).molarMass : null;
    const moles = byMass ? input.massGrams! / mm! : input.moles!;
    const round = (x: number) => Math.round(x * 1e6) / 1e6;
    return { result: round(moles / input.volumeLiters), unit: 'mol/L' as const, moles: round(moles), molarMass: mm };
  },
});

const TERMS = ['c1', 'v1', 'c2', 'v2'] as const;

export const dilution = defineTool({
  name: 'dilution',
  title: 'Dilution (C1V1 = C2V2)',
  description: 'Solves the dilution equation C1 * V1 = C2 * V2 for the one omitted quantity.',
  whenToUse: ['"how much 2 M stock do I need to make 200 mL of 0.5 M?"'],
  whenNotToUse: ['mixing two solutions of different concentrations'],
  limitations: ['exactly one of c1, v1, c2, v2 must be omitted', 'use the same concentration unit for c1/c2 and the same volume unit for v1/v2'],
  examples: [{ input: { c1: 2, c2: 0.5, v2: 200 }, output: { result: 50, solvedFor: 'v1' } }],
  input: z.strictObject({
    c1: z.number().positive().optional().describe('Initial (stock) concentration.'),
    v1: z.number().positive().optional().describe('Volume of stock solution.'),
    c2: z.number().positive().optional().describe('Final concentration.'),
    v2: z.number().positive().optional().describe('Final volume.'),
  }),
  output: z.object({ result: z.number(), solvedFor: z.enum(TERMS) }),
  execute(input) {
    const missing = TERMS.filter((t) => input[t] === undefined);
    if (missing.length !== 1) throw invalidInput('provide exactly three of c1, v1, c2, v2', missing[0]);
    const unknown = missing[0]!;
    const { c1, v1, c2, v2 } = input;
    const result =
      unknown === 'c1' ? (c2! * v2!) / v1! : unknown === 'v1' ? (c2! * v2!) / c1! : unknown === 'c2' ? (c1! * v1!) / v2! : (c1! * v1!) / c2!;
    if (!Number.isFinite(result)) throw divisionByZero('division by zero while solving the dilution equation');
    return { result: Math.round(result * 1e9) / 1e9, solvedFor: unknown };
  },
});
