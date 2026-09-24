# @rickrosten/agent-deterministic-tools-finance

Deterministic financial calculations for AI agents, with decimal precision and **explicit
conventions**: nothing ambiguous is chosen silently.

| Tool | Purpose |
| --- | --- |
| `finance.compound_interest` | FV and interest of a single deposit |
| `finance.simple_interest` | non-compounding interest (years, or days + day count) |
| `finance.future_value` / `finance.present_value` | lump-sum TVM |
| `finance.annuity_future_value` / `finance.annuity_present_value` | level payment streams |
| `finance.loan_payment` | level payment of an amortizing loan |
| `finance.loan_amortization` | full schedule |
| `finance.total_interest` | total interest over the loan |
| `finance.npv` | net present value |
| `finance.irr` | internal rate of return |

## Conventions

| Topic | Rule |
| --- | --- |
| Rates | `annualRatePercent` / `ratePercent` are in percent: `5` = 5%. |
| Nominal vs effective | `rateType` is **required**. `nominal`: periodic rate = r / compoundingPerYear (APR-style). `effective`: r already includes compounding (APY/AER). |
| Compounding frequency | `compoundingPerYear` is **required**. |
| Payment frequency | `paymentsPerYear` is **required** for annuities and loans. If it differs from `compoundingPerYear`, the equivalent rate per payment period `(1 + i_c)^(m/p) - 1` is used. |
| Payment timing | `paymentTiming` (`end` / `begin`) is **required** for annuities and loans. |
| NPV timing | `firstCashFlowAt` (`now` / `end_of_first_period`) is **required**. Excel `NPV()` equals `end_of_first_period`. |
| Sign convention | TVM amounts are positive magnitudes. NPV/IRR cash flows are signed: negative = outflow. |
| Day count | Not applicable (period based), except `simple_interest` with `days`, which requires `dayCount` (`actual_360` / `actual_365`). |
| Precision | All intermediate values: 34 significant digits (`decimal.js`, private clone). |
| Rounding | Only final results are rounded: `scale` (default 2) and `roundingMode` (default `half_up`), both echoed in the output. |
| Loan schedules | Level payment rounded to `scale`; each period's interest rounded to `scale`; final payment adjusted so the balance ends at exactly 0. `total_interest` uses the same schedule. |

Every monetary result contains `result` (number), `resultDecimal` (exact string),
`scale`, `roundingMode`, `internalPrecision` and, when `currency` is supplied, `currency`
and `formatted`.

```json
{
  "result": 16470.09,
  "resultDecimal": "16470.09",
  "interest": 6470.09,
  "scale": 2,
  "roundingMode": "half_up",
  "internalPrecision": 34,
  "currency": "EUR",
  "formatted": "€16,470.09"
}
```
