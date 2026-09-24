import { Decimal as DecimalJs } from 'decimal.js';

/** Private Decimal constructor; the global decimal.js configuration is never modified. */
export const D = DecimalJs.clone({ precision: 40, rounding: DecimalJs.ROUND_HALF_EVEN, toExpNeg: -40, toExpPos: 40 });
export type Dec = InstanceType<typeof D>;

export function toNumber(value: Dec): number {
  const n = value.toNumber();
  return Object.is(n, -0) ? 0 : n;
}
