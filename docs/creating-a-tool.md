# Creating a tool

A tool is a pure function with a validated input schema, a validated output schema and
metadata written for LLM tool selection.

```ts
import { defineTool, divisionByZero, z } from '@rickrosten/agent-deterministic-tools-core';

export const percentageChange = defineTool({
  name: 'percentage_change',                 // snake_case; the module id is prefixed: math.percentage_change
  title: 'Percentage change',
  description: 'Calculates relative change from oldValue to newValue in percent.',
  whenToUse: ['growth or decline between two values'],
  whenNotToUse: ['percentage points between two percentages (subtract them)'],
  limitations: ['oldValue must be non-zero'],
  examples: [{ input: { oldValue: 50, newValue: 75 }, output: { percentage: 50 } }],
  input: z.strictObject({
    oldValue: z.number().describe('Original value. Must be non-zero.'),
    newValue: z.number().describe('New value.'),
  }),
  output: z.object({ percentage: z.number() }),
  execute({ oldValue, newValue }) {
    if (oldValue === 0) throw divisionByZero('oldValue must not be 0', 'oldValue');
    return { percentage: ((newValue - oldValue) / Math.abs(oldValue)) * 100 };
  },
});
```

After registration the tool automatically appears in the registry, MCP `tools/list`, JSON
Schema exports (`deterministic-tools schema`), OpenAI definitions and `docs/tools.md`.

## Defining schemas

- Always import `z` from `@rickrosten/agent-deterministic-tools-core` so the whole process uses one zod instance.
- Use `z.strictObject` for inputs: unknown fields are reported (`"Unknown field: rate"`)
  instead of silently ignored, which catches misspelled parameters from the model.
- `describe()` every field. Descriptions become JSON Schema `description`s the model reads.
- Put units and conventions into names and descriptions (`annualRatePercent`, "5 means 5%").
- Required means required: if a parameter changes the result in an ambiguous way (nominal vs
  effective, payment timing), do not give it a default.
- Defaults are fine for unambiguous presentation options; echo them in the output.
- `z.number()` already rejects `NaN` and `Infinity`.
- Outputs must be objects (MCP requires object `outputSchema`). Prefer `result` for the main
  value plus explicit fields (`unit`, `scale`, `method`...). Never return prose only.

## Errors

Throw a `ToolError` for anything the caller can fix; everything else becomes
`INTERNAL_ERROR` without internal details.

```ts
import { ErrorCode, ToolError, invalidInput, outOfRange } from '@rickrosten/agent-deterministic-tools-core';

throw new ToolError(ErrorCode.INVALID_UNIT, 'unknown unit "furlongz"', { field: 'from', details: { suggestions: ['fur'] } });
throw invalidInput('provide exactly one of `years` or `days`', 'years');
throw outOfRange('even root of a negative number has no real result', 'value');
```

Non-finite numbers in the output are automatically converted to `OUT_OF_RANGE`; output that
does not match `output` is reported as `INTERNAL_ERROR` (it is a bug in the tool).

## Determinism checklist

- Only use the `input` argument. No `Date.now()`, `new Date()` without explicit input,
  `Math.random()`, `process.env`, file system, network or child processes.
- No host time zone: take time zones as explicit input.
- No global state: if you configure a library (e.g. `decimal.js`), use a private clone.
- For money, use decimal arithmetic and report `scale` and rounding mode.

## Metadata for tool selection

`formatToolDescription` builds the text the model sees:

```text
Calculates relative change from oldValue to newValue in percent.
Use when: growth or decline between two values.
Do not use when: percentage points between two percentages (subtract them).
Limitations: oldValue must be non-zero.
Example input: {"oldValue":50,"newValue":75}
Deterministic: same input always yields the same output. Errors are returned as {code, message, field}.
```

Write `whenNotToUse` entries that point to the right sibling tool.

## Testing tools

Test through the registry so validation and error mapping are covered:

```ts
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createRegistry } from '@rickrosten/agent-deterministic-tools-core';
import { myModule } from '../src/index.js';

const registry = createRegistry([myModule]);

it('known value', async () => {
  expect(await registry.execute('acme.percentage_change', { oldValue: 50, newValue: 75 })).toEqual({ ok: true, data: { percentage: 50 } });
});

it('edge case', async () => {
  expect(await registry.execute('acme.percentage_change', { oldValue: 0, newValue: 1 })).toMatchObject({ ok: false, error: { code: 'DIVISION_BY_ZERO' } });
});

it('invalid input', async () => {
  expect(await registry.execute('acme.percentage_change', { oldValue: '1' })).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT', field: 'oldValue' } });
});

it('property', async () => {
  await fc.assert(fc.asyncProperty(fc.integer({ min: 1, max: 1e6 }), async (x) => {
    const r = await registry.execute('acme.percentage_change', { oldValue: x, newValue: x });
    expect(r).toMatchObject({ ok: true, data: { percentage: 0 } });
  }));
});
```

Recommended categories: known values (from a reference such as Excel or a textbook), edge
cases, boundaries, invalid input, regressions, and property-based tests where a mathematical
law exists (inverse operations, monotonicity, invariance). Also make sure every `examples`
entry actually runs; this repository tests all examples automatically.
