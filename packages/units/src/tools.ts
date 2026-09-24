import { defineTool, ErrorCode, ToolError, z } from '@rickrosten/agent-deterministic-tools-core';
import { AMBIGUOUS, BASE_UNITS, CATEGORIES, UNITS } from './catalog.js';
import { D, toNumber } from './decimal.js';
import { fromBase, resolveUnit, toBase } from './resolve.js';

const unitInfo = z.object({ id: z.string(), name: z.string() });

export const convert = defineTool({
  name: 'convert',
  title: 'Convert units',
  description:
    'Converts a value between units of the same category: length, mass, temperature, area, volume, speed, time, energy, power, pressure, data. Exact decimal factors (SI/NIST).',
  whenToUse: ['"100 km/h in m/s"', '"72 °F in °C"', '"5 GiB in MB"', 'any unit conversion'],
  whenNotToUse: ['currency conversion (exchange rates are not deterministic)', 'converting between different quantities (e.g. kg to L needs a density)'],
  limitations: [
    'units are case-sensitive where it matters: MB = megabyte, Mb = megabit, mb = millibar, kB = 1000 B, KiB = 1024 B',
    'ambiguous symbols (gal, pt, qt, fl oz, cup, ton, KB, month, year) are rejected with INVALID_UNIT listing the exact alternatives such as gal_us / gal_imp',
    'temperatures are absolute (not differences); values below absolute zero return OUT_OF_RANGE',
    'cal = thermochemical calorie (4.184 J), kcal/Cal = food Calorie; hp = mechanical horsepower (use hp_metric for PS)',
    'call units.list_units to see all units and aliases',
  ],
  examples: [
    { input: { value: 100, from: 'km/h', to: 'm/s' }, output: { result: 27.77777777777778, from: { id: 'km/h' }, to: { id: 'm/s' }, category: 'speed' } },
    { input: { value: 72, from: '°F', to: '°C' }, output: { result: 22.22222222222222 } },
  ],
  input: z.strictObject({
    value: z.number().describe('Value to convert.'),
    from: z.string().min(1).max(40).describe('Source unit symbol or name, e.g. "km/h", "°F", "GiB", "square feet".'),
    to: z.string().min(1).max(40).describe('Target unit symbol or name.'),
    significantDigits: z
      .number()
      .int()
      .min(1)
      .max(30)
      .optional()
      .describe('Optional rounding of the result to N significant digits. Default: no rounding.'),
  }),
  output: z.object({
    result: z.number().describe('Converted value (nearest double).'),
    resultDecimal: z.string().describe('Converted value as a decimal string (up to 30 significant digits).'),
    value: z.number(),
    from: unitInfo,
    to: unitInfo,
    category: z.enum(CATEGORIES),
    significantDigits: z.number().int().nullable(),
  }),
  execute({ value, from, to, significantDigits }) {
    const src = resolveUnit(from, 'from');
    const dst = resolveUnit(to, 'to');
    if (src.category !== dst.category) {
      throw new ToolError(
        ErrorCode.INVALID_UNIT,
        `cannot convert ${src.category} (${src.id}) to ${dst.category} (${dst.id}); units must belong to the same category`,
        { field: 'to', details: { fromCategory: src.category, toCategory: dst.category } },
      );
    }
    const base = toBase(new D(value), src);
    if (src.category === 'temperature' && base.isNeg()) {
      throw new ToolError(ErrorCode.OUT_OF_RANGE, `${value} ${src.id} is below absolute zero`, { field: 'value' });
    }
    let out = fromBase(base, dst);
    out = significantDigits === undefined ? out.toSignificantDigits(30) : out.toSignificantDigits(significantDigits);
    return {
      result: toNumber(out),
      resultDecimal: out.isZero() ? '0' : out.toString(),
      value,
      from: { id: src.id, name: src.name },
      to: { id: dst.id, name: dst.name },
      category: src.category,
      significantDigits: significantDigits ?? null,
    };
  },
});

export const listUnits = defineTool({
  name: 'list_units',
  title: 'List supported units',
  description: 'Lists supported unit categories, units, their canonical symbols and common aliases, plus ambiguous symbols that must be disambiguated.',
  whenToUse: ['before units.convert when unsure which symbol is supported'],
  whenNotToUse: ['you already know both units (call units.convert directly)'],
  examples: [{ input: { category: 'data' } }],
  input: z.strictObject({ category: z.enum(CATEGORIES).optional().describe('Optional category filter.') }),
  output: z.object({
    categories: z.array(
      z.object({
        category: z.enum(CATEGORIES),
        baseUnit: z.string(),
        units: z.array(z.object({ id: z.string(), name: z.string(), aliases: z.array(z.string()) })),
      }),
    ),
    ambiguous: z.record(z.string(), z.array(z.string())),
  }),
  execute({ category }) {
    const cats = category ? [category] : [...CATEGORIES];
    const ids = new Set(UNITS.filter((u) => cats.includes(u.category)).map((u) => u.id));
    return {
      categories: cats.map((c) => ({
        category: c,
        baseUnit: BASE_UNITS[c],
        units: UNITS.filter((u) => u.category === c).map((u) => ({ id: u.id, name: u.name, aliases: u.aliases.slice(0, 5) })),
      })),
      ambiguous: Object.fromEntries(
        Object.entries(AMBIGUOUS)
          .filter(([, v]) => v.some((id) => ids.has(id)))
          .map(([k, v]) => [k, [...v]]),
      ),
    };
  },
});
