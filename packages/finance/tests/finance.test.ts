import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createRegistry } from '@rickrosten/agent-deterministic-tools-core';
import { financeModule } from '@rickrosten/agent-deterministic-tools-finance';

const registry = createRegistry([financeModule]);
const ok = async (tool: string, input: unknown) => {
  const res = await registry.execute<Record<string, unknown>>(`finance.${tool}`, input);
  if (!res.ok) throw new Error(`${tool} failed: ${JSON.stringify(res.error)}`);
  return res.data;
};
const err = async (tool: string, input: unknown) => {
  const res = await registry.execute(`finance.${tool}`, input);
  if (res.ok) throw new Error(`${tool} unexpectedly succeeded: ${JSON.stringify(res.data)}`);
  return res.error;
};

const monthly = { rateType: 'nominal', compoundingPerYear: 12 } as const;
const mortgage = {
  principal: 200000,
  annualRatePercent: 6,
  ...monthly,
  paymentsPerYear: 12,
  years: 30,
  paymentTiming: 'end',
} as const;

describe('finance module', () => {
  it('exposes all required tools', () => {
    expect(registry.list().map((t) => t.name)).toEqual([
      'finance.compound_interest',
      'finance.simple_interest',
      'finance.future_value',
      'finance.present_value',
      'finance.annuity_future_value',
      'finance.annuity_present_value',
      'finance.loan_payment',
      'finance.loan_amortization',
      'finance.total_interest',
      'finance.npv',
      'finance.irr',
    ]);
  });

  it('every tool documents its conventions', () => {
    for (const d of registry.describeAll()) {
      expect(d.limitations.length, d.name).toBeGreaterThan(0);
    }
  });
});

describe('compound_interest', () => {
  it('nominal monthly', async () => {
    const r = await ok('compound_interest', { principal: 10000, annualRatePercent: 5, ...monthly, years: 10 });
    expect(r).toMatchObject({
      result: 16470.09,
      resultDecimal: '16470.09',
      interest: 6470.09,
      periods: 120,
      scale: 2,
      roundingMode: 'half_up',
      internalPrecision: 34,
      effectiveAnnualRatePercent: 5.1161897882,
    });
  });
  it('effective rate does not depend on compounding frequency', async () => {
    const a = await ok('compound_interest', { principal: 10000, annualRatePercent: 5, rateType: 'effective', compoundingPerYear: 12, years: 10 });
    const b = await ok('compound_interest', { principal: 10000, annualRatePercent: 5, rateType: 'effective', compoundingPerYear: 1, years: 10 });
    expect(a.result).toBe(16288.95);
    expect(b.result).toBe(16288.95);
    expect(a.effectiveAnnualRatePercent).toBe(5);
  });
  it('requires explicit conventions', async () => {
    expect(await err('compound_interest', { principal: 1000, annualRatePercent: 5, years: 1, compoundingPerYear: 12 })).toMatchObject({
      code: 'INVALID_INPUT',
      field: 'rateType',
    });
    expect(await err('compound_interest', { principal: 1000, annualRatePercent: 5, years: 1, rateType: 'nominal' })).toMatchObject({
      code: 'INVALID_INPUT',
      field: 'compoundingPerYear',
    });
  });
  it('validates amounts', async () => {
    const base = { annualRatePercent: 5, ...monthly, years: 1 };
    expect(await err('compound_interest', { ...base, principal: -5 })).toMatchObject({ code: 'INVALID_INPUT', field: 'principal' });
    expect(await err('compound_interest', { ...base, principal: 'abc' })).toMatchObject({ code: 'INVALID_INPUT', field: 'principal' });
    expect(await err('compound_interest', { ...base, principal: 100, annualRatePercent: -100 })).toMatchObject({ field: 'annualRatePercent' });
  });
  it('accepts exact decimal strings and formats currency', async () => {
    const r = await ok('compound_interest', { principal: '12000.50', annualRatePercent: 3.2, rateType: 'nominal', compoundingPerYear: 4, years: 5, currency: 'EUR' });
    expect(r).toMatchObject({ result: 14073.75, currency: 'EUR', formatted: '€14,073.75' });
  });
  it('zero years returns the principal', async () => {
    expect(await ok('compound_interest', { principal: 999.99, annualRatePercent: 7, ...monthly, years: 0 })).toMatchObject({ result: 999.99, interest: 0 });
  });
  it('rejects unknown currency', async () => {
    expect(await err('compound_interest', { principal: 1, annualRatePercent: 1, ...monthly, years: 1, currency: 'XYZ1' })).toMatchObject({ field: 'currency' });
  });
});

describe('simple_interest', () => {
  it('years', async () => {
    expect(await ok('simple_interest', { principal: 5000, annualRatePercent: 4, years: 2 })).toMatchObject({
      result: 400,
      totalAmount: 5400,
      yearFraction: 2,
      dayCount: null,
    });
  });
  it('days with day count', async () => {
    expect(await ok('simple_interest', { principal: 1000000, annualRatePercent: 3.5, days: 90, dayCount: 'actual_360' })).toMatchObject({ result: 8750 });
    expect(await ok('simple_interest', { principal: 1000000, annualRatePercent: 3.5, days: 90, dayCount: 'actual_365' })).toMatchObject({ result: 8630.14 });
  });
  it('rejects ambiguous time input', async () => {
    expect(await err('simple_interest', { principal: 1, annualRatePercent: 1 })).toMatchObject({ code: 'INVALID_INPUT' });
    expect(await err('simple_interest', { principal: 1, annualRatePercent: 1, years: 1, days: 30, dayCount: 'actual_360' })).toMatchObject({ code: 'INVALID_INPUT' });
    expect(await err('simple_interest', { principal: 1, annualRatePercent: 1, days: 30 })).toMatchObject({ code: 'INVALID_INPUT', field: 'dayCount' });
  });
});

describe('future_value / present_value', () => {
  it('known values', async () => {
    expect(await ok('future_value', { presentValue: 1000, annualRatePercent: 7, rateType: 'effective', compoundingPerYear: 1, years: 5 })).toMatchObject({ result: 1402.55 });
    expect(await ok('present_value', { futureValue: 50000, annualRatePercent: 6, rateType: 'effective', compoundingPerYear: 1, years: 8 })).toMatchObject({
      result: 31370.62,
      discount: 18629.38,
    });
  });
  it('property: present_value(future_value(x)) == x', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10_000_000 }),
        fc.integer({ min: 0, max: 2000 }),
        fc.integer({ min: 0, max: 50 }),
        async (cents, ratePermille, y) => {
          const common = { annualRatePercent: ratePermille / 100, ...monthly, years: y, scale: 10 };
          const fv = await ok('future_value', { presentValue: cents / 100, ...common });
          const pv = await ok('present_value', { futureValue: fv.resultDecimal, ...common, scale: 2 });
          expect(pv.result).toBe(cents / 100);
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe('annuities', () => {
  const plan = { payment: 100, annualRatePercent: 6, ...monthly, paymentsPerYear: 12, years: 10 };
  it('future value end/begin', async () => {
    expect(await ok('annuity_future_value', { ...plan, paymentTiming: 'end' })).toMatchObject({
      result: 16387.93,
      totalContributions: 12000,
      interest: 4387.93,
      numberOfPayments: 120,
    });
    expect(await ok('annuity_future_value', { ...plan, paymentTiming: 'begin' })).toMatchObject({ result: 16469.87 });
  });
  it('present value end/begin', async () => {
    expect(await ok('annuity_present_value', { ...plan, paymentTiming: 'end' })).toMatchObject({ result: 9007.35 });
    expect(await ok('annuity_present_value', { ...plan, paymentTiming: 'begin' })).toMatchObject({ result: 9052.38 });
  });
  it('zero rate', async () => {
    expect(await ok('annuity_future_value', { ...plan, annualRatePercent: 0, paymentTiming: 'end' })).toMatchObject({ result: 12000 });
  });
  it('requires payment timing', async () => {
    expect(await err('annuity_future_value', plan)).toMatchObject({ code: 'INVALID_INPUT', field: 'paymentTiming' });
  });
  it('rejects fractional payment counts', async () => {
    expect(await err('annuity_present_value', { ...plan, years: 1.05, paymentTiming: 'end' })).toMatchObject({ code: 'INVALID_INPUT', field: 'years' });
  });
  it('converts between compounding and payment frequency', async () => {
    const r = await ok('annuity_present_value', { ...plan, compoundingPerYear: 1, rateType: 'effective', paymentTiming: 'end' });
    expect(r.periodicRatePercent).toBe(0.4867550565);
  });
});

describe('loans', () => {
  it('mortgage payment', async () => {
    const r = await ok('loan_payment', mortgage);
    expect(r).toMatchObject({ result: 1199.1, resultDecimal: '1199.10', numberOfPayments: 360, periodicRatePercent: 0.5 });
    expect(r.totalOfPayments).toBe(Math.round(((r.totalInterest as number) + 200000) * 100) / 100);
  });
  it('total interest matches the amortization schedule', async () => {
    const t = await ok('total_interest', mortgage);
    const a = await ok('loan_amortization', mortgage);
    expect(t.result).toBe(a.totalInterest);
    expect(t.result).toBe(231677.04);
    const schedule = a.schedule as Array<Record<string, number>>;
    expect(schedule).toHaveLength(360);
    expect(schedule[0]).toEqual({ period: 1, payment: 1199.1, interest: 1000, principal: 199.1, balance: 199800.9 });
    expect(schedule[359]!.balance).toBe(0);
  });
  it('small schedule is exact to the cent', async () => {
    const a = await ok('loan_amortization', {
      principal: 1000,
      annualRatePercent: 12,
      ...monthly,
      paymentsPerYear: 12,
      years: 0.25,
      paymentTiming: 'end',
    });
    expect(a.result).toBe(340.02);
    expect(a.schedule).toEqual([
      { period: 1, payment: 340.02, interest: 10, principal: 330.02, balance: 669.98 },
      { period: 2, payment: 340.02, interest: 6.7, principal: 333.32, balance: 336.66 },
      { period: 3, payment: 340.03, interest: 3.37, principal: 336.66, balance: 0 },
    ]);
    expect(a.finalPayment).toBe(340.03);
    expect(a.totalInterest).toBe(20.07);
  });
  it('payments at the beginning of periods', async () => {
    const a = await ok('loan_amortization', { principal: 1000, annualRatePercent: 12, ...monthly, paymentsPerYear: 12, years: 0.25, paymentTiming: 'begin' });
    const schedule = a.schedule as Array<Record<string, number>>;
    expect(a.result).toBe(336.66);
    expect(schedule[0]!.interest).toBe(0);
    expect(schedule[2]!.balance).toBe(0);
  });
  it('zero interest loan', async () => {
    expect(await ok('loan_payment', { ...mortgage, annualRatePercent: 0, principal: 1200, years: 1 })).toMatchObject({ result: 100, totalInterest: 0 });
  });
  it('rejects negative loan rate and huge schedules', async () => {
    expect(await err('loan_payment', { ...mortgage, annualRatePercent: -1 })).toMatchObject({ field: 'annualRatePercent' });
    expect(await err('loan_amortization', { ...mortgage, paymentsPerYear: 365, years: 30 })).toMatchObject({ code: 'OUT_OF_RANGE' });
  });
  it('property: schedule always ends at zero and principal sums to the loan', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 100, max: 1_000_000 }),
        fc.integer({ min: 0, max: 2500 }),
        fc.integer({ min: 1, max: 30 }),
        fc.constantFrom('end', 'begin'),
        async (principal, rateBp, y, timing) => {
          const a = await ok('loan_amortization', {
            principal,
            annualRatePercent: rateBp / 100,
            ...monthly,
            paymentsPerYear: 12,
            years: y,
            paymentTiming: timing,
          });
          const rows = a.schedule as Array<Record<string, number>>;
          expect(rows[rows.length - 1]!.balance).toBe(0);
          const principalSum = rows.reduce((s, r) => s + Math.round(r.principal! * 100), 0);
          expect(principalSum).toBe(principal * 100);
        },
      ),
      { numRuns: 40 },
    );
  });
});

describe('npv', () => {
  const flows = [-10000, 3000, 4200, 6800];
  it('Excel convention', async () => {
    expect(await ok('npv', { ratePercent: 10, cashFlows: flows, firstCashFlowAt: 'end_of_first_period' })).toMatchObject({ result: 1188.44 });
  });
  it('time-zero convention', async () => {
    const r = await ok('npv', { ratePercent: 10, cashFlows: flows, firstCashFlowAt: 'now' });
    expect(r).toMatchObject({ result: 1307.29, discountedCashFlows: [-10000, 2727.27, 3471.07, 5108.94] });
  });
  it('requires explicit timing', async () => {
    expect(await err('npv', { ratePercent: 10, cashFlows: flows })).toMatchObject({ code: 'INVALID_INPUT', field: 'firstCashFlowAt' });
  });
  it('rejects empty cash flows', async () => {
    expect(await err('npv', { ratePercent: 10, cashFlows: [], firstCashFlowAt: 'now' })).toMatchObject({ field: 'cashFlows' });
  });
});

describe('irr', () => {
  it('Excel reference values', async () => {
    const flows = [-70000, 12000, 15000, 18000, 21000, 26000];
    expect(await ok('irr', { cashFlows: flows })).toMatchObject({ result: 8.663095, multipleSolutions: false });
    expect((await ok('irr', { cashFlows: flows.slice(0, 5) })).result).toBe(-2.124485);
    expect((await ok('irr', { cashFlows: flows.slice(0, 3) })).result).toBe(-44.350694);
  });
  it('NPV at IRR is zero', async () => {
    const flows = [-1000, 300, 400, 500];
    const r = await ok('irr', { cashFlows: flows, decimals: 12 });
    const n = await ok('npv', { ratePercent: r.result, cashFlows: flows, firstCashFlowAt: 'now', scale: 6 });
    expect(Math.abs(n.result as number)).toBeLessThan(1e-5);
  });
  it('reports multiple solutions', async () => {
    const r = await ok('irr', { cashFlows: [-100, 230, -132] });
    expect(r).toMatchObject({ result: 10, solutions: [10, 20], multipleSolutions: true });
  });
  it('annualizes with periodsPerYear', async () => {
    const r = await ok('irr', { cashFlows: [-1000, 1010], periodsPerYear: 12 });
    expect(r).toMatchObject({ result: 1, effectiveAnnualRatePercent: 12.682503 });
  });
  it('undefined IRR', async () => {
    expect(await err('irr', { cashFlows: [100, 200] })).toMatchObject({ code: 'UNSUPPORTED_OPERATION' });
    expect(await err('irr', { cashFlows: [-100, -200] })).toMatchObject({ code: 'UNSUPPORTED_OPERATION' });
    expect(await err('irr', { cashFlows: [-100] })).toMatchObject({ code: 'INVALID_INPUT' });
  });
  it('is deterministic', async () => {
    const input = { cashFlows: [-5000, 1200, 1400, 1600, 1800, '2000.55'] };
    const a = await ok('irr', input);
    const b = await ok('irr', input);
    expect(a).toEqual(b);
  });
});
