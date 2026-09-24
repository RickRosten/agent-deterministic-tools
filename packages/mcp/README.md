# @rickrosten/agent-deterministic-tools-mcp

MCP adapter for Deterministic Tools. Builds `tools/list` and `tools/call` automatically from
a `ToolRegistry` and serves them over **stdio** or **Streamable HTTP**.

```ts
import { createRegistry } from '@rickrosten/agent-deterministic-tools-core';
import { mathModule } from '@rickrosten/agent-deterministic-tools-math';
import { serveStdio, createStreamableHttpServer } from '@rickrosten/agent-deterministic-tools-mcp';

const registry = createRegistry([mathModule]);

await serveStdio(registry);                                  // local clients
await createStreamableHttpServer(registry, { port: 3333 }).listen(); // http://127.0.0.1:3333/mcp
```

- Success: `structuredContent` (matches the tool's `outputSchema`) + the same JSON as text.
- Tool error: `isError: true` and text `{"error": {"code", "message", "field"}}`.
- Unknown or disabled tool: JSON-RPC `InvalidParams`.
- HTTP is stateless (fresh MCP server per request), binds to `127.0.0.1` by default,
  validates `Host`/`Origin`, supports a static bearer token or a custom `authenticate` hook
  (e.g. OAuth 2.1 token validation) and publishes RFC 9728
  `/.well-known/oauth-protected-resource` metadata when configured.

See [docs/mcp.md](../../docs/mcp.md).
