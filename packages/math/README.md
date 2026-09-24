# @rickrosten/agent-deterministic-tools-math

Deterministic math tools for AI agents.

| Tool | Purpose |
| --- | --- |
| `math.percentage` | what percent `part` is of `whole` |
| `math.percentage_of` | `percent`% of `value` |
| `math.percentage_change` | relative change from old to new |
| `math.ratio` | `a / b` and reduced `x:y` |
| `math.proportion` | solve `a/b = c/d` for the missing term |
| `math.average` | arithmetic mean |
| `math.weighted_average` | weighted mean |
| `math.sum` | exact sum |
| `math.min` / `math.max` | extremes with index |
| `math.round` | rounding with explicit mode |
| `math.power` / `math.root` | powers and real n-th roots |

## Precision

Arithmetic is done with 40 significant decimal digits (private `decimal.js` clone) and the
result is rounded once to the nearest IEEE-754 double. `0.1 + 0.2` returns `0.3`.

```ts
import { createRegistry } from '@rickrosten/agent-deterministic-tools-core';
import { mathModule } from '@rickrosten/agent-deterministic-tools-math';

const registry = createRegistry([mathModule]);
await registry.execute('math.percentage_change', { oldValue: 50, newValue: 75 });
// { ok: true, data: { result: 50, unit: 'percent', absoluteChange: 25, direction: 'increase' } }
```
