import { Decimal as DecimalJs } from 'decimal.js';

/**
 * Private Decimal constructor. `clone` keeps configuration local to this module so that
 * other modules (or the host application) are never affected.
 */
export const D = DecimalJs.clone({ precision: 40, rounding: DecimalJs.ROUND_HALF_EVEN, toExpNeg: -30, toExpPos: 40 });
export type Dec = InstanceType<typeof D>;

/** Converts to the nearest IEEE-754 double and normalizes negative zero. */
export function toNumber(value: Dec): number {
  const n = value.toNumber();
  return Object.is(n, -0) ? 0 : n;
}

/**
 * Exact sum, independent of the order of the values. The working precision covers every
 * digit from the largest to the smallest addend, so no intermediate rounding happens
 * (e.g. 5e-324 + -1e12 + 1e12 is 5e-324 in any order).
 */
export function sum(values: readonly (number | Dec)[]): Dec {
  const ds = values.map((v) => new D(v));
  let maxE = -Infinity;
  let minE = Infinity;
  for (const d of ds) {
    if (d.isZero()) continue;
    maxE = Math.max(maxE, d.e);
    minE = Math.min(minE, d.e - d.sd() + 1);
  }
  if (maxE === -Infinity) return new D(0);
  const precision = Math.max(40, maxE - minE + String(ds.length).length + 2);
  const Exact = D.clone({ precision });
  let acc = new Exact(0);
  for (const d of ds) acc = acc.plus(d);
  return new D(acc);
}

export const ROUNDING_MODES = ['half_up', 'half_even', 'half_down', 'up', 'down', 'ceil', 'floor'] as const;
export type RoundingMode = (typeof ROUNDING_MODES)[number];

export const ROUNDING_MODE_MAP: Record<RoundingMode, DecimalJs.Rounding> = {
  half_up: DecimalJs.ROUND_HALF_UP,
  half_even: DecimalJs.ROUND_HALF_EVEN,
  half_down: DecimalJs.ROUND_HALF_DOWN,
  up: DecimalJs.ROUND_UP,
  down: DecimalJs.ROUND_DOWN,
  ceil: DecimalJs.ROUND_CEIL,
  floor: DecimalJs.ROUND_FLOOR,
};
