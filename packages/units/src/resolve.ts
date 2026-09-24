import { ErrorCode, ToolError } from '@rickrosten/agent-deterministic-tools-core';
import { AMBIGUOUS, UNITS, type UnitDef } from './catalog.js';
import { D, type Dec } from './decimal.js';

/**
 * Normalizes spelling differences that never change meaning: Unicode compatibility forms
 * (² -> 2, ℃ -> °C), micro sign variants, "^", multiplication dots, "per" and whitespace.
 * Case is preserved: "MB" (megabyte), "Mb" (megabit) and "mb" (millibar) differ.
 */
export function normalizeUnit(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/[\u00B5\u03BC]/g, 'u')
    .replace(/\^/g, '')
    .replace(/[·⋅*]/g, '.')
    .replace(/\s+per\s+/gi, '/')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
}

const exactIndex = new Map<string, UnitDef>();
const foldedIndex = new Map<string, Set<UnitDef>>();

function addKey(key: string, unit: UnitDef): void {
  const k = normalizeUnit(key);
  const existing = exactIndex.get(k);
  if (existing && existing !== unit) {
    throw new Error(`units catalog: "${key}" is used by both ${existing.id} and ${unit.id}`);
  }
  exactIndex.set(k, unit);
  const folded = k.toLowerCase();
  const set = foldedIndex.get(folded) ?? new Set<UnitDef>();
  set.add(unit);
  foldedIndex.set(folded, set);
}

for (const unit of UNITS) {
  addKey(unit.id, unit);
  for (const alias of unit.aliases) addKey(alias, unit);
}

const ambiguousIndex = new Map<string, readonly string[]>(
  Object.entries(AMBIGUOUS).map(([k, v]) => [normalizeUnit(k), v]),
);

export function unitById(id: string): UnitDef {
  const unit = exactIndex.get(normalizeUnit(id));
  if (!unit) throw new Error(`unknown unit id ${id}`);
  return unit;
}

function describeChoice(id: string): string {
  const u = unitById(id);
  return `${u.id} (${u.name})`;
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length]!;
}

function suggestions(key: string): string[] {
  const folded = key.toLowerCase();
  const scored = new Map<string, number>();
  for (const [k, set] of foldedIndex) {
    const d = levenshtein(folded, k);
    for (const u of set) {
      const best = scored.get(u.id);
      if (best === undefined || d < best) scored.set(u.id, d);
    }
  }
  return [...scored.entries()]
    .filter(([, d]) => d <= Math.max(2, Math.floor(folded.length / 3)))
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([id]) => id);
}

/** Resolves a user-supplied unit string; throws INVALID_UNIT for unknown or ambiguous units. */
export function resolveUnit(raw: string, field: string): UnitDef {
  const key = normalizeUnit(raw);
  const exact = exactIndex.get(key);
  if (exact) return exact;

  const ambiguous = ambiguousIndex.get(key) ?? ambiguousIndex.get(key.toLowerCase());
  if (ambiguous) {
    throw new ToolError(
      ErrorCode.INVALID_UNIT,
      `${field}: "${raw}" is ambiguous. Use one of: ${ambiguous.map(describeChoice).join(', ')}`,
      { field, details: { candidates: [...ambiguous] } },
    );
  }

  const folded = foldedIndex.get(key.toLowerCase());
  if (folded && folded.size === 1) return [...folded][0]!;
  if (folded && folded.size > 1) {
    const ids = [...folded].map((u) => u.id);
    throw new ToolError(
      ErrorCode.INVALID_UNIT,
      `${field}: "${raw}" is ambiguous (unit symbols are case-sensitive). Use one of: ${ids.map(describeChoice).join(', ')}`,
      { field, details: { candidates: ids } },
    );
  }

  const hint = suggestions(key);
  throw new ToolError(
    ErrorCode.INVALID_UNIT,
    `${field}: unknown unit "${raw}".${hint.length ? ` Did you mean: ${hint.join(', ')}?` : ''} Call units.list_units for supported units.`,
    { field, details: { suggestions: hint } },
  );
}

const factorCache = new Map<string, Dec>();

/** Parses "1609.344" or an exact ratio "1000/3600". */
export function factorOf(unit: UnitDef): Dec {
  let f = factorCache.get(unit.id);
  if (!f) {
    const [num, den] = unit.factor.split('/');
    f = den === undefined ? new D(num!) : new D(num!).div(den);
    factorCache.set(unit.id, f);
  }
  return f;
}

export function toBase(value: Dec, unit: UnitDef): Dec {
  return value.plus(unit.offset ?? 0).times(factorOf(unit));
}

export function fromBase(value: Dec, unit: UnitDef): Dec {
  return value.div(factorOf(unit)).minus(unit.offset ?? 0);
}
