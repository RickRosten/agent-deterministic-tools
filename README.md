# Deterministic Tools

**Exact calculations for AI agents.** The LLM reasons and orchestrates; Deterministic Tools
computes.

```text
User -> AI agent -> finance.compound_interest(...) -> Deterministic Tools -> validated, exact result -> AI agent
```

LLMs are unreliable at arithmetic, compounding, date math and unit conversion. This project
gives them a local MCP server (and an OpenAI function-calling adapter) with **43 strictly
typed, validated, deterministic tools** across math, finance, statistics, dates and units.
Same input, same output, every time. No LLM, network, clock, randomness or host time zone
inside the tools.

```bash
npx @rickrosten/agent-deterministic-tools
```

The setup wizard picks modules, writes the configuration and connects **Claude Desktop**,
**Cursor** or **Claude Code** for you. No manual JSON editing.

## Example

```json
// tools/call finance.compound_interest
{ "principal": 10000, "annualRatePercent": 5, "rateType": "nominal", "compoundingPerYear": 12, "years": 10, "currency": "EUR" }
```

```json
{
  "result": 16470.09,
  "resultDecimal": "16470.09",
  "interest": 6470.09,
  "periods": 120,
  "effectiveAnnualRatePercent": 5.1161897882,
  "scale": 2,
  "roundingMode": "half_up",
  "internalPrecision": 34,
  "currency": "EUR",
  "formatted": "€16,470.09"
}
```

Invalid input never produces a result. It produces an error the agent can act on:

```json
{ "error": { "code": "INVALID_INPUT", "message": "rateType is required (one of: \"nominal\", \"effective\")", "field": "rateType" } }
```

## Modules

| Module | Tools |
| --- | --- |
| `math` | percentage, percentage_of, percentage_change, ratio, proportion, average, weighted_average, sum, min, max, round, power, root |
| `finance` | compound_interest, simple_interest, future_value, present_value, annuity_future_value, annuity_present_value, loan_payment, loan_amortization, total_interest, npv, irr |
| `statistics` | mean, median, mode, variance, standard_deviation, percentile, min, max, sum |
| `datetime` | date_difference, add_days, add_business_days, business_days_between, is_business_day, day_of_week, days_in_month, is_leap_year |
| `units` | convert (length, mass, temperature, area, volume, speed, time, energy, power, pressure, data), list_units |

Full reference: [docs/tools.md](docs/tools.md). Conventions per module: [docs/modules.md](docs/modules.md).

## Integrations

| Client | How |
| --- | --- |
| Claude Desktop | `npx @rickrosten/agent-deterministic-tools install claude` ([docs](docs/claude.md)) |
| Claude Code | `npx @rickrosten/agent-deterministic-tools install claude-code` ([docs](docs/claude.md#claude-code)) |
| Cursor | `npx @rickrosten/agent-deterministic-tools install cursor` or the one-click deeplink ([docs](docs/cursor.md)) |
| OpenAI (MCP) | `npx @rickrosten/agent-deterministic-tools serve --http` or the Docker image ([docs](docs/openai.md)) |
| OpenAI API / Agents SDK | `@rickrosten/agent-deterministic-tools-openai` function definitions ([docs](docs/openai.md#function-calling)) |
| Any MCP client | stdio: `npx -y @rickrosten/agent-deterministic-tools serve` ([docs](docs/mcp.md)) |

## CLI

```bash
deterministic-tools                  # setup wizard (terminal) / stdio MCP server (spawned by a client)
deterministic-tools list             # tools of enabled modules
deterministic-tools modules          # modules and status
deterministic-tools enable finance   # module-level configuration
deterministic-tools disable finance
deterministic-tools doctor           # Node.js, config, modules, client configs, server start, tool calls
deterministic-tools serve [--http]   # stdio (default) or Streamable HTTP
deterministic-tools config           # show | path | init | validate
deterministic-tools call math.sum '{"values":[0.1,0.2]}'
deterministic-tools --debug ...      # execution records on stderr (no input values by default)
```

Configuration is optional and minimal:

```json
{ "modules": ["math", "finance", "datetime"] }
```

Only tools of enabled modules are published, so the model does not load tools it does not need.

## For developers

```bash
npm install @rickrosten/agent-deterministic-tools-core
```

```ts
import { defineTool, defineModule, createRegistry, z } from '@rickrosten/agent-deterministic-tools-core';

export const percentageChange = defineTool({
  name: 'percentage_change',
  description: 'Calculates percentage change from oldValue to newValue.',
  input: z.strictObject({ oldValue: z.number(), newValue: z.number() }),
  output: z.object({ percentage: z.number() }),
  execute: ({ oldValue, newValue }) => ({ percentage: ((newValue - oldValue) / oldValue) * 100 }),
});

export default defineModule({ id: 'acme', name: 'Acme', version: '1.0.0', description: '...', tools: [percentageChange] });
```

A registered tool automatically appears in the registry, in MCP `tools/list`, in JSON Schema
exports, in OpenAI definitions and in the generated documentation. See
[creating a tool](docs/creating-a-tool.md) and [creating a module](docs/creating-a-module.md);
[examples/acme-chemistry](examples/acme-chemistry) is a complete third-party module.

## Documentation

[Architecture](docs/architecture.md) ·
[Modules](docs/modules.md) ·
[Tools](docs/tools.md) ·
[Creating a module](docs/creating-a-module.md) ·
[Creating a tool](docs/creating-a-tool.md) ·
[MCP](docs/mcp.md) ·
[Claude](docs/claude.md) ·
[Cursor](docs/cursor.md) ·
[OpenAI](docs/openai.md) ·
[Security](docs/security.md) ·
[Contributing](docs/contributing.md)

## Principle

```text
Reasoning   -> AI
Calculation -> Deterministic Tools
Transport   -> MCP / SDK / future adapters
```

Requires Node.js 20+. Linux, macOS and Windows. MIT licensed.
