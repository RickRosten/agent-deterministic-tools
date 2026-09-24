# @rickrosten/agent-deterministic-tools-statistics

Deterministic descriptive statistics for AI agents.

Tools: `statistics.mean`, `median`, `mode`, `variance`, `standard_deviation`, `percentile`,
`min`, `max`, `sum`.

## Conventions

- **Variance / standard deviation**: `kind` is required. `population` divides by `n`,
  `sample` divides by `n - 1` (Bessel correction). Sample statistics need at least 2 values.
- **Percentile**: 0-100 scale. `method` defaults to `linear` (R-7, Excel `PERCENTILE.INC`,
  NumPy default) and is always echoed in the output. Also available: `exclusive` (R-6, Excel
  `PERCENTILE.EXC`), `nearest_rank`, `lower`, `higher`, `midpoint`, `nearest`.
- **Mode**: returns every value that has the highest frequency. If all values are unique
  (and n > 1) there is no mode: `modes: []`, `hasMode: false`.
- **Empty arrays**: rejected with `INVALID_INPUT` (`field: "values"`).
- **NaN / Infinity**: not representable in JSON and rejected by the schema with
  `INVALID_INPUT` pointing at the offending element (e.g. `values[3]`).
- **Precision**: sums and deviations use 40-digit decimal arithmetic (two-pass algorithm),
  results are rounded once to the nearest double.
