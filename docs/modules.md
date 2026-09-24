# Modules

A module is an independent set of tools with metadata (`id`, `name`, `version`,
`description`, `tools`). Tool names are namespaced by module id: `finance.npv`.

| Module | Package | Tools | Conventions |
| --- | --- | --- | --- |
| math | `@rickrosten/agent-deterministic-tools-math` | 13 | [below](#math) |
| finance | `@rickrosten/agent-deterministic-tools-finance` | 11 | [below](#finance) |
| statistics | `@rickrosten/agent-deterministic-tools-statistics` | 9 | [below](#statistics) |
| datetime | `@rickrosten/agent-deterministic-tools-datetime` | 8 | [below](#datetime) |
| units | `@rickrosten/agent-deterministic-tools-units` | 2 | [below](#units) |

The full per-tool reference (parameters, limitations, examples) is generated from the
registry: [tools.md](tools.md).

## Enabling modules

```bash
deterministic-tools modules            # status
deterministic-tools enable finance
deterministic-tools disable statistics
```

This edits the configuration file (`deterministic-tools config path`):

```json
{
  "modules": ["math", "finance", "datetime"],
  "disabledTools": ["finance.irr"],
  "plugins": ["@acme/chemistry"]
}
```

- `modules` omitted: every installed module is enabled.
- Only tools of enabled modules are published over MCP, keeping the model's tool list small.
- `disabledTools` hides individual tools.
- `plugins` is an explicit allow-list of third-party modules (see [security](security.md)).

## math

- Inputs are finite JSON numbers; `NaN`/`Infinity` cannot be sent and are rejected.
- Arithmetic uses 40 significant digits, result rounded once to the nearest double.
- `round` takes an explicit `mode` (`half_up` default, `half_even`, `half_down`, `up`, `down`,
  `ceil`, `floor`) and rounds the decimal representation (2.675 -> 2.68).
- `percentage_change` divides by `|oldValue|`; `oldValue = 0` is `DIVISION_BY_ZERO`.
- `proportion` solves `a/b = c/d` for the one omitted term.
- `root`: even roots of negative numbers are `OUT_OF_RANGE`; odd roots return the negative real root.

## finance

Nothing ambiguous is chosen silently; conventions are inputs and are echoed back.

| Topic | Rule |
| --- | --- |
| Rate unit | percent (`5` = 5%) |
| Nominal vs effective | `rateType` required |
| Compounding frequency | `compoundingPerYear` required |
| Payment frequency | `paymentsPerYear` required for annuities and loans; converted to an equivalent periodic rate when it differs from compounding |
| Payment timing | `paymentTiming` (`end`/`begin`) required for annuities and loans |
| NPV timing | `firstCashFlowAt` (`now` / `end_of_first_period` = Excel `NPV()`) required |
| Sign convention | TVM amounts are positive magnitudes; NPV/IRR flows are signed (outflow negative) |
| Day count | period-based; `simple_interest` with `days` requires `dayCount` (`actual_360` / `actual_365`) |
| Precision | 34 significant digits internally |
| Rounding | final results only: `scale` (default 2) + `roundingMode` (default `half_up`) |
| Loans | level payment rounded; each period's interest rounded; last payment adjusted to reach exactly 0; `total_interest` uses the same schedule |
| IRR | grid bracketing from -99.99% to 10000% per period + safeguarded Newton; all roots reported, `result` closest to 0 |

Money outputs: `result` (number), `resultDecimal` (exact string), `scale`, `roundingMode`,
`internalPrecision`, optional `currency` and `formatted`.

## statistics

- `variance` / `standard_deviation`: `kind` required (`population` divides by n, `sample` by n - 1).
- `percentile`: 0-100 scale, `method` default `linear` (R-7 = Excel `PERCENTILE.INC` = NumPy
  default), also `exclusive` (R-6, `PERCENTILE.EXC`), `nearest_rank`, `lower`, `higher`,
  `midpoint`, `nearest`; the method is echoed.
- `mode`: all values with the highest frequency; no mode (`[]`) when all values are unique.
- Empty arrays: `INVALID_INPUT`. `NaN`/`Infinity`: rejected by the schema.

## datetime

- Dates `YYYY-MM-DD` (proleptic Gregorian, years 1-9999), pure integer arithmetic.
- Date-times must carry an offset (`Z`, `+02:00`); otherwise `INVALID_DATE`.
- Optional IANA `timeZone` interprets date-times as wall-clock time in that zone; DST gaps move
  forward and overlaps pick the earlier instant.
- No implicit "today": the agent passes the current date.
- Business days: `weekend` default Saturday + Sunday (echoed), holidays passed explicitly.
  `add_business_days` = Excel `WORKDAY`, `business_days_between` with `endpoints: both` =
  `NETWORKDAYS`.

## units

- 11 categories, exact SI/NIST factors, affine temperatures.
- Case-sensitive symbols where it matters (`MB` megabyte, `Mb` megabit, `mb` millibar).
- Ambiguous symbols (`gal`, `pt`, `qt`, `fl oz`, `cup`, `ton`, `KB`, `month`, `year`) are
  rejected with the exact alternatives (`gal_us`, `gal_imp`, ...).
- `units.list_units` lists everything, including aliases.

## Third-party modules

Any npm package (any scope) that exports a module works. See
[creating a module](creating-a-module.md) and [examples/acme-chemistry](../examples/acme-chemistry).

```bash
deterministic-tools plugin add @acme/chemistry
```

Automatic loading of arbitrary packages is disabled: only packages listed in `plugins` are loaded.
