# MCP interface

`@rickrosten/agent-deterministic-tools-mcp` turns a `ToolRegistry` into an MCP server. Every enabled tool is exposed
through `tools/list` and `tools/call`; nothing is declared by hand.

## tools/list

Each tool is published as:

| MCP field | Source |
| --- | --- |
| `name` | fully-qualified registry name, e.g. `finance.loan_payment` |
| `title` | tool title |
| `description` | purpose, `Use when`, `Do not use when`, `Limitations`, example input (see below) |
| `inputSchema` | JSON Schema (draft 2020-12) generated from the zod input schema |
| `outputSchema` | JSON Schema generated from the zod output schema |
| `annotations` | `readOnlyHint: true`, `idempotentHint: true`, `destructiveHint: false`, `openWorldHint: false` |
| `_meta` | `deterministic-tools/module`, `deterministic-tools/moduleVersion` |

Descriptions are written for tool selection by the model, e.g.:

```text
Level periodic payment of a fully amortizing loan: PMT = P * i / (1 - (1 + i)^-n) ...
Use when: monthly mortgage or car loan payment; "what is the payment on 200,000 at 6% for 30 years?".
Do not use when: you need the full schedule (use finance.loan_amortization); only total interest (use finance.total_interest).
Limitations: annualRatePercent is in percent (5 = 5%); ...
Example input: {"principal":200000,"annualRatePercent":6,...}
Deterministic: same input always yields the same output. Errors are returned as {code, message, field}.
```

The server `instructions` list the enabled modules and tell the model to use the tools
instead of computing results itself.

## tools/call

Success:

```json
{
  "content": [{ "type": "text", "text": "{\"result\":1199.1,...}" }],
  "structuredContent": { "result": 1199.1, "resultDecimal": "1199.10", "scale": 2, "...": "..." }
}
```

Tool error (the model can read and fix it):

```json
{
  "isError": true,
  "content": [{ "type": "text", "text": "{\"error\":{\"code\":\"INVALID_INPUT\",\"message\":\"paymentTiming is required (one of: \\\"end\\\", \\\"begin\\\")\",\"field\":\"paymentTiming\"}}" }]
}
```

Unknown or disabled tools return JSON-RPC error `-32602` (Invalid params), as the MCP
specification recommends. Stack traces are never returned.

## Transports

### stdio (local)

```bash
npx -y @rickrosten/agent-deterministic-tools serve
```

Used by Claude Desktop, Cursor, Claude Code and most local clients. stdout carries only
protocol messages; logs go to stderr. Client configuration:

```json
{ "mcpServers": { "deterministic-tools": { "command": "npx", "args": ["-y", "@rickrosten/agent-deterministic-tools", "serve"] } } }
```

On Windows use `"command": "cmd", "args": ["/c", "npx", "-y", "@rickrosten/agent-deterministic-tools", "serve"]`
(the CLI's `install` command does this automatically).

### Streamable HTTP (remote)

```bash
npx @rickrosten/agent-deterministic-tools serve --http --port 3333
# -> http://127.0.0.1:3333/mcp
```

- Stateless: every POST is handled by a fresh MCP server bound to the shared registry; JSON
  responses. `GET`/`DELETE` return 405.
- Binds to `127.0.0.1` by default. On loopback, only loopback `Host`/`Origin` values are
  accepted (DNS-rebinding protection); add more with `--allowed-host` / `--allowed-origin`.
- `GET /healthz` returns `{"status":"ok","tools":N}`.

For deployments use [`apps/server`](../apps/server) (Docker image, environment configuration).

## Authentication

The HTTP transport follows the MCP authorization architecture: the MCP server is an OAuth 2.1
resource server.

- **Static bearer token** (simple deployments, internal networks):
  `serve --http --auth-token <token>` or `DETERMINISTIC_TOOLS_AUTH_TOKEN`. Requests without
  the token get `401` with `WWW-Authenticate: Bearer`.
- **OAuth** (public deployments): configure `http.authorizationServers` in the config (or
  `AUTHORIZATION_SERVERS` for the server app). The server publishes RFC 9728 metadata at
  `/.well-known/oauth-protected-resource` and answers `401` with
  `WWW-Authenticate: Bearer resource_metadata="..."`, so MCP clients can discover the
  authorization server. Token validation is plugged in via the `authenticate` hook of
  `createStreamableHttpServer` (verify JWT signature, audience = your MCP URL, expiry, scopes).

```ts
createStreamableHttpServer(registry, {
  host: '0.0.0.0',
  publicUrl: 'https://mcp.example.com',
  auth: {
    resourceMetadata: { authorizationServers: ['https://auth.example.com'], scopesSupported: ['tools'] },
    authenticate: async (req, token) => (token ? await verifyAccessToken(token) : null),
  },
});
```

The server app refuses to bind to a non-loopback address without authentication unless
`DETERMINISTIC_TOOLS_ALLOW_UNAUTHENTICATED=true` (for use behind an authenticating proxy).

## Tool discovery and configuration

Only tools of enabled modules are listed (`deterministic-tools enable/disable`, or
`"modules"` in the config). The registry is read on each request.

## Programmatic use

```ts
import { createRegistry } from '@rickrosten/agent-deterministic-tools-core';
import { financeModule } from '@rickrosten/agent-deterministic-tools-finance';
import { createMcpServer, serveStdio, createStreamableHttpServer, connectInMemory } from '@rickrosten/agent-deterministic-tools-mcp';

const registry = createRegistry([financeModule]);
await serveStdio(registry, { logger: (level, msg) => console.error(level, msg) });
```
