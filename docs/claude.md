# Claude integration

## Claude Desktop

### Automatic (recommended)

```bash
npx @rickrosten/agent-deterministic-tools            # wizard: choose modules, tick "Claude Desktop"
# or directly
npx @rickrosten/agent-deterministic-tools install claude
```

The CLI adds the server to `claude_desktop_config.json`, keeps all other servers and
settings, and saves the previous file as `claude_desktop_config.json.bak`. Restart Claude
Desktop; the tools appear under the tools icon of the chat input.

| OS | Config file |
| --- | --- |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux (community builds) | `~/.config/Claude/claude_desktop_config.json` |

### Manual

Settings > Developer > Edit Config, then add:

```json
{
  "mcpServers": {
    "deterministic-tools": {
      "command": "npx",
      "args": ["-y", "@rickrosten/agent-deterministic-tools", "serve"]
    }
  }
}
```

Windows:

```json
{
  "mcpServers": {
    "deterministic-tools": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "@rickrosten/agent-deterministic-tools", "serve"]
    }
  }
}
```

`npx @rickrosten/agent-deterministic-tools install claude --print` prints the exact snippet for your machine.

## Claude Code

Project scope (writes `.mcp.json` in the current directory, shareable via git):

```bash
npx @rickrosten/agent-deterministic-tools install claude-code
```

All projects (user scope):

```bash
claude mcp add --scope user deterministic-tools -- npx -y @rickrosten/agent-deterministic-tools serve
```

## Other Claude MCP-compatible environments

Any client that supports stdio MCP servers can run `npx -y @rickrosten/agent-deterministic-tools serve`.
Clients that connect to remote MCP servers can use the Streamable HTTP endpoint
([mcp.md](mcp.md#streamable-http-remote)).

## Choosing modules

```bash
npx @rickrosten/agent-deterministic-tools disable statistics
npx @rickrosten/agent-deterministic-tools enable finance
```

Restart Claude Desktop after changes (it reads the tool list on start).

## Troubleshooting

```bash
npx @rickrosten/agent-deterministic-tools doctor
```

`doctor` checks Node.js (20+), the configuration, modules, whether Claude/Cursor configs
contain the server, starts the server over stdio and calls a sample tool of every module.

- **Tools do not show up**: fully quit Claude Desktop (not only the window) and restart.
- **`npx` not found**: install Node.js 20+ and make sure it is on the PATH used by GUI apps
  (on macOS with nvm, use an absolute path to `npx` in `command`).
- **Logs**: Claude Desktop writes MCP logs to `~/Library/Logs/Claude/mcp*.log` (macOS) or
  `%APPDATA%\Claude\logs` (Windows). Add `"--debug"` to `args` for execution logs.
