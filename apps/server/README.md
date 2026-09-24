# Deterministic Tools server

Deployable Streamable HTTP MCP endpoint (for remote clients and OpenAI MCP integrations).

```bash
docker build -f apps/server/Dockerfile -t deterministic-tools-server .
docker run -p 3333:3333 -e DETERMINISTIC_TOOLS_AUTH_TOKEN=change-me deterministic-tools-server
# -> http://localhost:3333/mcp  (Authorization: Bearer change-me)
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `HOST` | `127.0.0.1` (`0.0.0.0` in Docker) | bind address |
| `PORT` | `3333` | port |
| `MCP_PATH` | `/mcp` | endpoint path |
| `DETERMINISTIC_TOOLS_MODULES` | all | comma-separated module ids |
| `DETERMINISTIC_TOOLS_AUTH_TOKEN` | - | required bearer token |
| `DETERMINISTIC_TOOLS_ALLOW_UNAUTHENTICATED` | `false` | allow non-loopback binds without token (only behind an authenticating proxy) |
| `PUBLIC_URL` | - | public base URL (auth metadata) |
| `AUTHORIZATION_SERVERS` | - | OAuth issuers advertised at `/.well-known/oauth-protected-resource` |
| `ALLOWED_ORIGINS` / `ALLOWED_HOSTS` | - | extra allowed `Origin` / `Host` values |

`GET /healthz` returns `{"status":"ok","tools":N}`.
