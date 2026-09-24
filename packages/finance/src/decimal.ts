import { Decimal as DecimalJs } from 'decimal.js';

/** Significant digits used for every intermediate financial calculation. */
export const INTERNAL_PRECISION = 34;

/**
 * Private Decimal constructor (IEEE 754-2008 decimal128-like precision). `clone` keeps the
 * configuration local to this module; the global decimal.js defaults are never touched.
 */
export const D = DecimalJs.clone({
  precision: INTERNAL_PRECISION,
  rounding: DecimalJs.ROUND_HALF_EVEN,
  toExpNeg: -40,
  toExpPos: 40,
});
export type Dec = InstanceType<typeof D>;

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

export function toNumber(value: Dec): number {
  const n = value.toNumber();
  return Object.is(n, -0) ? 0 : n;
}
