# Security

Principle: **input -> deterministic function -> output.**

## What tools never do

- execute shell commands, JavaScript or any code taken from input (there is no `eval`,
  `new Function` or expression parser; ESLint forbids them);
- read or write files;
- make network requests or send data to external services;
- read environment variables, the clock or random sources;
- call an LLM.

These rules are enforced for the built-in module packages by ESLint (`no-eval`,
`no-new-func`, restricted `node:fs`, `node:child_process`, `node:http(s)`, `Math.random`,
`Date.now`, `process.env`) and verified by review. Tool metadata advertises
`readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: false`.

## Input handling

- Every tool validates input with a strict schema before running; unknown fields are rejected.
- Array sizes, numeric ranges, string lengths and loop counts are bounded (e.g. 100,000
  values, 12,000 loan periods, 1,000 cash flows) to prevent resource exhaustion.
- Errors never include stack traces or internal messages; unexpected exceptions become
  `INTERNAL_ERROR` with a generic message.

## Logging

Execution records contain the tool name, validation results, duration and error code.
**Input values are not logged** unless explicitly enabled (`--log-inputs` or
`"logInputs": true`). Logs go to stderr only.

## Third-party modules

Third-party modules are code and run with the privileges of the server process.

- Automatic loading of arbitrary npm packages is disabled. Only specifiers explicitly listed in
  `plugins` (via `deterministic-tools plugin add` or by editing the config) are loaded.
- `plugin add <package>` installs into the configuration directory with a visible
  `npm install`; review the package before allowing it.
- Each module is validated (`id`, semver `version`, tool shapes, name conflicts) before
  registration; conflicting ids are rejected.

## HTTP transport

- Binds to `127.0.0.1` by default. On loopback it rejects foreign `Host` and `Origin` headers
  (DNS rebinding protection).
- Supports bearer tokens (constant-time comparison) and OAuth 2.1 resource-server mode with
  RFC 9728 metadata ([mcp.md](mcp.md#authentication)).
- The deployable server refuses to listen on a public interface without authentication
  unless explicitly overridden for use behind an authenticating proxy.
- Stateless: no sessions or per-client state are kept. Request bodies are limited to 1 MiB.
- Terminate TLS in front of the server for any non-local deployment.

## Client configuration files

`deterministic-tools install` only edits the `mcpServers.deterministic-tools` entry of the
client configuration, writes atomically and keeps a `.bak` copy of the previous file.

## Reporting vulnerabilities

Please report security issues privately via GitHub Security Advisories on the repository
instead of opening a public issue.
