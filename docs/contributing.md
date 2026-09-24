# Contributing

## Setup

```bash
git clone https://github.com/RickRosten/agent-deterministic-tools.git
cd agent-deterministic-tools
npm install          # Node.js 20+ (22 recommended, see .nvmrc)
npm run check        # typecheck, lint, tests, build, package validation
```

## Repository layout

```text
packages/core         Tool, Module, ToolRegistry, validation, errors
packages/math         built-in modules
packages/finance
packages/statistics
packages/datetime
packages/units
packages/mcp          MCP adapter (stdio, Streamable HTTP)
packages/openai       OpenAI function-calling adapter
packages/cli          `@rickrosten/agent-deterministic-tools` CLI
apps/server           deployable HTTP server + Dockerfile
examples/             third-party module and OpenAI examples
tests/                integration tests and the public API snapshot
api/                  tools.snapshot.json
docs/                 documentation
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run typecheck` | TypeScript strict mode over all packages and tests |
| `npm run lint` | ESLint (includes determinism rules for module packages) |
| `npm test` | all tests (stdio integration tests are skipped without a build) |
| `npm run test:unit` | unit tests only |
| `npm run build` | builds every package in dependency order (tsup) |
| `npm run test:integration` | integration tests against the build |
| `npm run validate:packages` | `publint` + `npm pack --dry-run` for every public package |
| `npm run api:snapshot` | regenerate `api/tools.snapshot.json` |
| `npm run docs:tools` | regenerate `docs/tools.md` from tool metadata (after build) |

## Adding or changing a tool

1. Implement it with `defineTool` ([creating a tool](creating-a-tool.md)).
2. Tests: known values, edge cases, boundaries, invalid input, regressions; property-based
   tests (fast-check) for mathematical laws.
3. Give it at least one `examples` entry with `output`; examples are executed in CI.
4. `npm run api:snapshot` and review the diff of `api/tools.snapshot.json`.
5. `npm run build && npm run docs:tools`.
6. `npx changeset` and choose the bump (see below).

## Versioning

Semantic versioning, managed by [changesets](https://github.com/changesets/changesets).
The tool API is public API:

| Change | Bump |
| --- | --- |
| new tool, new optional input field, new output field | minor |
| bug fix that corrects a wrong result | patch (document it clearly) |
| rename/remove a tool, add a required input, remove/rename a field, change a default, change semantics or units | **major** |

`tests/api-snapshot.test.ts` fails on any change of names or schemas until the snapshot is
regenerated, so API changes cannot slip through unnoticed.

## Commits and pull requests

- Conventional commits: `feat(finance): ...`, `fix(units): ...`, `docs: ...`, `test: ...`,
  `chore: ...`, `refactor: ...`, `ci: ...`. Reference issues with `#123`.
- Small, focused pull requests. Keep the description up to date when behavior changes.
- CI must be green: typecheck, lint, unit tests, build, integration tests, package validation
  on Linux, macOS and Windows with Node.js 20 and 22.

## Releases

Merging changesets to `main` makes the release workflow open a "Version Packages" pull
request (bumps versions, updates `CHANGELOG.md` and `server.json`). Merging that pull request
publishes the packages to npm with provenance, creates GitHub releases and publishes
`server.json` to the MCP Registry. Setup details: [publishing](publishing.md).
