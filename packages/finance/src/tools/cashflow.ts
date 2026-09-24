import { defineTool, ErrorCode, ToolError, z } from '@rickrosten/agent-deterministic-tools-core';
import { amount, CONVENTIONS, currency, resultBlock, resultOutput, roundingMode, roundNum, scale } from '../common.js';
import { D, INTERNAL_PRECISION, toNumber, type Dec } from '../decimal.js';

export const MAX_CASH_FLOWS = 1000;

const cashFlows = z
  .array(amount('Cash flow.').describe('Signed cash flow: negative = money paid out (investment), positive = money received.'))
  .max(MAX_CASH_FLOWS)
  .describe(
    `Signed cash flows at equally spaced periods, in chronological order (max ${MAX_CASH_FLOWS}). Negative = outflow, positive = inflow. Numbers or exact decimal strings.`,
  );

const signConvention = 'cash flows are signed: negative values are outflows (investments), positive values are inflows';
const spacing = 'cash flows must be equally spaced; the rate is per spacing period (use a monthly rate for monthly flows)';

/** NPV at rate r where flows[k] is discounted by (1 + r)^(k + offset), plus d NPV / d r. */
function npvWithDerivative(flows: readonly Dec[], r: Dec, offset = 0): { npv: Dec; dnpv: Dec } {
  const v = new D(1).div(r.plus(1));
  let p = new D(0);
  let dp = new D(0);
  for (let k = flows.length - 1; k >= 0; k--) {
    dp = dp.times(v).plus(p);
    p = p.times(v).plus(flows[k]!);
  }
  // p = sum flows[k] v^k ; dp = d p / d v ; d v / d r = -v^2
  let npv = p;
  let dnpv = dp.times(v.times(v)).neg();
  if (offset !== 0) {
    const f = v.pow(offset);
    dnpv = dnpv.times(f).minus(npv.times(offset).times(f).times(v));
    npv = npv.times(f);
  }
  return { npv, dnpv };
}

export const FIRST_CASH_FLOW_AT = ['now', 'end_of_first_period'] as const;

export const npv = defineTool({
  name: 'npv',
  title: 'Net present value',
  description:
    'Net present value of equally spaced signed cash flows at a periodic discount rate. Whether cashFlows[0] occurs now (undiscounted) or at the end of the first period must be stated explicitly.',
  whenToUse: ['evaluating an investment with an initial outlay and future returns', 'discounting irregular amounts at equal intervals'],
  whenNotToUse: ['equal payments (use finance.annuity_present_value)', 'finding the break-even rate (use finance.irr)'],
  limitations: [
    signConvention,
    spacing,
    'firstCashFlowAt "now": NPV = sum CF[k] / (1+r)^k (cashFlows[0] undiscounted, the usual textbook/finance convention)',
    'firstCashFlowAt "end_of_first_period": NPV = sum CF[k] / (1+r)^(k+1) (Excel NPV() convention)',
    'ratePercent is the rate per period in percent (10 = 10%)',
    CONVENTIONS.rounding,
  ],
  examples: [
    {
      input: { ratePercent: 10, cashFlows: [-10000, 3000, 4200, 6800], firstCashFlowAt: 'end_of_first_period' },
      output: { result: 1188.44 },
    },
  ],
  input: z.strictObject({
    ratePercent: z.number().gt(-100).max(10_000).describe('Discount rate per period in PERCENT (10 means 10%).'),
    cashFlows: cashFlows.min(1),
    firstCashFlowAt: z
      .enum(FIRST_CASH_FLOW_AT)
      .describe('Required. "now": cashFlows[0] is at time 0 and not discounted. "end_of_first_period": cashFlows[0] is discounted one period (Excel NPV).'),
    scale,
    roundingMode,
    currency,
  }),
  output: z.object({
    ...resultOutput,
    result: z.number().describe('Net present value, rounded to `scale`. Positive means the investment beats the discount rate.'),
    discountedCashFlows: z.array(z.number()).describe('Present value of each cash flow, rounded to `scale`.'),
    firstCashFlowAt: z.enum(FIRST_CASH_FLOW_AT),
  }),
  execute(input) {
    const r = new D(input.ratePercent).div(100);
    const offset = input.firstCashFlowAt === 'now' ? 0 : 1;
    const base = r.plus(1);
    let total = new D(0);
    const discounted: number[] = [];
    input.cashFlows.forEach((cf, k) => {
      const pv = new D(cf).div(base.pow(k + offset));
      total = total.plus(pv);
      discounted.push(roundNum(pv, input));
    });
    return { ...resultBlock(total, input), discountedCashFlows: discounted, firstCashFlowAt: input.firstCashFlowAt };
  },
});

const MIN_RATE = -0.9999;
const MAX_RATE = 100;

function buildGrid(): Dec[] {
  const points = new Set<string>();
  points.add(String(MIN_RATE));
  points.add('-0.999');
  for (let k = -99; k <= 100; k++) points.add(new D(k).div(100).toString());
  for (let k = 21; k <= 60; k++) points.add(new D(k).div(20).toString());
  for (let k = 7; k <= 20; k++) points.add(new D(k).div(2).toString());
  for (let k = 3; k <= 20; k++) points.add(String(k * 5));
  return [...points].map((s) => new D(s)).sort((a, b) => a.comparedTo(b));
}

const GRID = buildGrid();
const TOLERANCE = new D('1e-24');
const MAX_ITERATIONS = 300;

/** Safeguarded Newton iteration inside a sign-changing bracket (falls back to bisection). */
function refineRoot(flows: readonly Dec[], lo: Dec, hi: Dec, fLo: Dec): Dec {
  let a = lo;
  let b = hi;
  let fa = fLo;
  let x = a.plus(b).div(2);
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const { npv: fx, dnpv } = npvWithDerivative(flows, x);
    if (fx.isZero()) return x;
    if (fx.isNeg() === fa.isNeg()) {
      a = x;
      fa = fx;
    } else {
      b = x;
    }
    if (b.minus(a).abs().lt(TOLERANCE)) return a.plus(b).div(2);
    let next = dnpv.isZero() ? null : x.minus(fx.div(dnpv));
    if (next === null || next.lte(a) || next.gte(b)) next = a.plus(b).div(2);
    if (next.minus(x).abs().lt(TOLERANCE)) return next;
    x = next;
  }
  return x;
}

export const irr = defineTool({
  name: 'irr',
  title: 'Internal rate of return',
  description:
    'Internal rate of return of equally spaced signed cash flows: the periodic rate at which NPV (with cashFlows[0] at time 0) equals zero.',
  whenToUse: ['return of an investment with an initial outlay and later inflows', 'Excel IRR() equivalent'],
  whenNotToUse: ['cash flows at irregular dates (not supported; XIRR is out of scope)', 'you already know the rate and need value (use finance.npv)'],
  limitations: [
    signConvention,
    spacing,
    'cashFlows[0] is at time 0; the result is the rate per spacing period in percent; pass periodsPerYear to also get the effective annual rate',
    'requires at least one negative and one positive cash flow (UNSUPPORTED_OPERATION otherwise)',
    `searches rates between ${MIN_RATE * 100}% and ${MAX_RATE * 100}% per period on a fixed grid, then refines each bracket with safeguarded Newton iteration (bisection fallback)`,
    'cash flows with several sign changes can have several IRRs: all found roots are returned in `solutions` and `result` is the one closest to 0',
  ],
  examples: [{ input: { cashFlows: [-70000, 12000, 15000, 18000, 21000, 26000] }, output: { result: 8.663095 } }],
  input: z.strictObject({
    cashFlows: cashFlows.min(2),
    periodsPerYear: z
      .number()
      .int()
      .min(1)
      .max(366)
      .optional()
      .describe('Optional. Periods per year of the cash-flow spacing (12 for monthly) to compute the effective annual rate.'),
    decimals: z.number().int().min(0).max(12).default(6).describe('Decimal places of percentage results. Default 6.'),
  }),
  output: z.object({
    result: z.number().describe('IRR per period in percent (8.5 means 8.5%).'),
    resultDecimal: z.string(),
    solutions: z.array(z.number()).describe('All IRRs found (percent per period), ascending.'),
    multipleSolutions: z.boolean(),
    effectiveAnnualRatePercent: z.number().nullable().describe('(1 + irr)^periodsPerYear - 1 in percent, or null without periodsPerYear.'),
    decimals: z.number().int(),
    internalPrecision: z.number().int(),
    method: z.string(),
  }),
  execute(input) {
    const flows = input.cashFlows.map((c) => new D(c));
    if (!flows.some((f) => f.isNeg()) || !flows.some((f) => f.gt(0))) {
      throw new ToolError(
        ErrorCode.UNSUPPORTED_OPERATION,
        'IRR is undefined unless cash flows contain at least one negative (outflow) and one positive (inflow) value',
        { field: 'cashFlows' },
      );
    }
    const roots: Dec[] = [];
    let prev = GRID[0]!;
    let fPrev = npvWithDerivative(flows, prev).npv;
    if (fPrev.isZero()) roots.push(prev);
    for (let j = 1; j < GRID.length; j++) {
      const x = GRID[j]!;
      const fx = npvWithDerivative(flows, x).npv;
      if (fx.isZero()) roots.push(x);
      else if (!fPrev.isZero() && fx.isNeg() !== fPrev.isNeg()) roots.push(refineRoot(flows, prev, x, fPrev));
      prev = x;
      fPrev = fx;
    }
    if (roots.length === 0) {
      throw new ToolError(
        ErrorCode.OUT_OF_RANGE,
        `no IRR found between ${MIN_RATE * 100}% and ${MAX_RATE * 100}% per period`,
        { field: 'cashFlows' },
      );
    }
    const toPct = (r: Dec) => r.times(100).toDecimalPlaces(input.decimals);
    const best = roots.reduce((a, b) => (b.abs().lt(a.abs()) ? b : a));
    const bestPct = toPct(best);
    return {
      result: toNumber(bestPct),
      resultDecimal: bestPct.toFixed(input.decimals),
      solutions: roots.map((r) => toNumber(toPct(r))),
      multipleSolutions: roots.length > 1,
      effectiveAnnualRatePercent:
        input.periodsPerYear === undefined ? null : toNumber(toPct(best.plus(1).pow(input.periodsPerYear).minus(1))),
      decimals: input.decimals,
      internalPrecision: INTERNAL_PRECISION,
      method: 'grid bracketing + safeguarded Newton-Raphson (bisection fallback)',
    };
  },
});
