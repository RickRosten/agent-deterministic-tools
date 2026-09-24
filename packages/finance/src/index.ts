import { defineModule } from '@rickrosten/agent-deterministic-tools-core';
import { annuityFutureValue, annuityPresentValue } from './tools/annuity.js';
import { irr, npv } from './tools/cashflow.js';
import { compoundInterest, futureValue, presentValue, simpleInterest } from './tools/interest.js';
import { loanAmortization, loanPayment, totalInterest } from './tools/loan.js';

export const VERSION = '1.0.0';

export const tools = [
  compoundInterest,
  simpleInterest,
  futureValue,
  presentValue,
  annuityFutureValue,
  annuityPresentValue,
  loanPayment,
  loanAmortization,
  totalInterest,
  npv,
  irr,
] as const;

export const financeModule = defineModule({
  id: 'finance',
  name: 'Finance',
  version: VERSION,
  description:
    'Time value of money with explicit conventions and decimal precision: compound/simple interest, future/present value, annuities, loan payment, amortization, total interest, NPV and IRR.',
  tools,
});

export default financeModule;

export {
  compoundInterest,
  simpleInterest,
  futureValue,
  presentValue,
  annuityFutureValue,
  annuityPresentValue,
  loanPayment,
  loanAmortization,
  totalInterest,
  npv,
  irr,
};
export { INTERNAL_PRECISION, ROUNDING_MODES, type RoundingMode } from './decimal.js';
export { RATE_TYPES, PAYMENT_TIMINGS, type RateType, type PaymentTiming } from './common.js';
