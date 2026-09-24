# Changelog

All notable changes to this project are documented here. The project follows
[Semantic Versioning](https://semver.org/). Per-package changelogs are maintained by
changesets in `packages/*/CHANGELOG.md`.

## 1.0.0 - 2026-09-24

First stable release.

### Core (`@rickrosten/agent-deterministic-tools-core`)

- `defineTool`, `defineModule`, `ToolRegistry` with namespacing, enable/disable, conflict
  detection and third-party module validation.
- `executeTool`: zod input validation, output validation, finite-number guard, structured
  errors (`INVALID_INPUT`, `INVALID_UNIT`, `INVALID_DATE`, `UNSUPPORTED_OPERATION`,
  `DIVISION_BY_ZERO`, `OUT_OF_RANGE`, `PRECISION_ERROR`, `TOOL_NOT_FOUND`, `INTERNAL_ERROR`),
  no stack traces.
- Execution records (tool, validation, duration, status) without input values by default.
- JSON Schema export and LLM-oriented tool descriptions.

### Modules

- `@rickrosten/agent-deterministic-tools-math`: 13 tools (percentages, ratio, proportion, averages, sum, min, max,
  round, power, root) on decimal arithmetic.
- `@rickrosten/agent-deterministic-tools-finance`: 11 tools (compound/simple interest, future/present value,
  annuities, loan payment, amortization, total interest, NPV, IRR) with explicit rate,
  compounding, payment and rounding conventions and 34-digit precision.
- `@rickrosten/agent-deterministic-tools-statistics`: 9 tools with explicit population/sample variance and
  percentile methods.
- `@rickrosten/agent-deterministic-tools-datetime`: 8 tools without hidden time zone or current time.
- `@rickrosten/agent-deterministic-tools-units`: `convert` and `list_units` across 11 categories with aliases and
  explicit handling of ambiguous symbols.

### Adapters

- `@rickrosten/agent-deterministic-tools-mcp`: MCP server generated from the registry; stdio and stateless
  Streamable HTTP with Host/Origin validation, bearer tokens, custom auth hooks and RFC 9728
  protected resource metadata.
- `@rickrosten/agent-deterministic-tools-openai`: Chat Completions, Responses API and Agents SDK tool definitions and
  executors, strict-schema conversion.

### CLI (`@rickrosten/agent-deterministic-tools`)

- `npx @rickrosten/agent-deterministic-tools` setup wizard; `serve`, `list`, `modules`, `enable`, `disable`,
  `config`, `doctor`, `install`/`uninstall` (Claude Desktop, Cursor, Claude Code), `plugin`,
  `call`, `schema`, `--debug`.
- Module-level configuration and explicit plugin allow-list.
- `config.schema.json` for editor completion of the configuration file.

### Distribution

- npm packages under the `@rickrosten` scope (`@rickrosten/agent-deterministic-tools*`).
- MCP Registry metadata (`server.json`, `mcpName`) published by the release workflow.

### Tooling

- Deployable server app with Dockerfile.
- CI on Linux, macOS and Windows with Node.js 20 and 22; release automation via changesets.
- Public tool API snapshot (`api/tools.snapshot.json`).
