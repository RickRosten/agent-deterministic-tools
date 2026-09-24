import { invalidInput } from '@rickrosten/agent-deterministic-tools-core';
import { ATOMIC_WEIGHTS } from './elements.js';

export const MAX_FORMULA_LENGTH = 200;
const MAX_DEPTH = 10;
const MAX_COUNT = 1_000_000;

/**
 * Parses a chemical formula into element counts. Supports nested (), [] and {} groups and
 * hydrate notation with "·", "." or "*" (e.g. CuSO4·5H2O). This is a small hand-written
 * parser: input is never evaluated as code.
 */
export function parseFormula(formula: string): Map<string, number> {
  const src = formula.replace(/\s+/g, '');
  if (!src) throw invalidInput('formula must not be empty', 'formula');
  if (src.length > MAX_FORMULA_LENGTH) throw invalidInput(`formula must be at most ${MAX_FORMULA_LENGTH} characters`, 'formula');

  const total = new Map<string, number>();
  for (const part of src.split(/[·.*]/)) {
    if (!part) throw invalidInput(`"${formula}" has an empty hydrate part`, 'formula');
    const lead = /^(\d+)/.exec(part);
    const multiplier = lead ? Number(lead[1]) : 1;
    const counts = parseGroup(part.slice(lead ? lead[1]!.length : 0), formula);
    for (const [el, n] of counts) total.set(el, (total.get(el) ?? 0) + n * multiplier);
  }
  return total;
}

function parseGroup(src: string, original: string): Map<string, number> {
  const stack: Map<string, number>[] = [new Map()];
  const closers: string[] = [];
  let i = 0;
  const readCount = (): number => {
    const m = /^\d+/.exec(src.slice(i));
    if (!m) return 1;
    i += m[0].length;
    const n = Number(m[0]);
    if (n < 1 || n > MAX_COUNT) throw invalidInput(`count ${m[0]} in "${original}" is out of range`, 'formula');
    return n;
  };
  const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  while (i < src.length) {
    const ch = src[i]!;
    if (ch in pairs) {
      if (stack.length > MAX_DEPTH) throw invalidInput(`"${original}" is nested too deeply`, 'formula');
      stack.push(new Map());
      closers.push(pairs[ch]!);
      i++;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      if (closers.pop() !== ch || stack.length < 2) throw invalidInput(`unbalanced "${ch}" in "${original}"`, 'formula');
      i++;
      const group = stack.pop()!;
      const n = readCount();
      const parent = stack[stack.length - 1]!;
      for (const [el, c] of group) parent.set(el, (parent.get(el) ?? 0) + c * n);
    } else if (/[A-Z]/.test(ch)) {
      const symbol = /^[A-Z][a-z]?/.exec(src.slice(i))![0];
      if (!(symbol in ATOMIC_WEIGHTS)) throw invalidInput(`unknown element "${symbol}" in "${original}"`, 'formula');
      i += symbol.length;
      const n = readCount();
      const top = stack[stack.length - 1]!;
      top.set(symbol, (top.get(symbol) ?? 0) + n);
    } else {
      throw invalidInput(`unexpected character "${ch}" in "${original}"`, 'formula');
    }
  }
  if (stack.length !== 1) throw invalidInput(`unbalanced brackets in "${original}"`, 'formula');
  return stack[0]!;
}

export interface CompositionEntry {
  element: string;
  count: number;
  mass: number;
  massPercent: number;
}

const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

export function molarMass(formula: string): { molarMass: number; composition: CompositionEntry[] } {
  const counts = parseFormula(formula);
  let total = 0;
  for (const [el, n] of counts) total += ATOMIC_WEIGHTS[el]! * n;
  const composition = [...counts.entries()].map(([element, count]) => ({
    element,
    count,
    mass: round(ATOMIC_WEIGHTS[element]! * count, 4),
    massPercent: round((ATOMIC_WEIGHTS[element]! * count * 100) / total, 3),
  }));
  return { molarMass: round(total, 3), composition };
}
