# Cursor integration

## Automatic (recommended)

```bash
npx @rickrosten/agent-deterministic-tools install cursor                    # all projects: ~/.cursor/mcp.json
npx @rickrosten/agent-deterministic-tools install cursor --scope project    # this project: ./.cursor/mcp.json
```

Existing servers in `mcp.json` are preserved; the previous file is kept as `mcp.json.bak`.
Cursor detects changes to `mcp.json`; the server appears under Settings > MCP (Tools & Integrations).

## One-click install

`npx @rickrosten/agent-deterministic-tools install cursor --print` prints a deeplink:

```text
cursor://anysphere.cursor-deeplink/mcp/install?name=deterministic-tools&config=<base64>
```

Opening it in Cursor 1.0+ shows an install dialog.

## Manual

Create `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project):

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

On Windows use `"command": "cmd"` and `"args": ["/c", "npx", "-y", "@rickrosten/agent-deterministic-tools", "serve"]`.

## Cursor versions

| Cursor | Supported configuration |
| --- | --- |
| 1.0 and later | `mcp.json` (global and project) + one-click deeplinks |
| 0.47 - 0.x | `mcp.json` (global and project); the CLI install works, deeplinks do not |
| 0.45 - 0.46 | UI only: Settings > Features > MCP > "Add new MCP server", type `command`, command `npx -y @rickrosten/agent-deterministic-tools serve` |
| older | no MCP support |

The CLI always writes the `mcp.json` format, which is what current versions read. For UI-only
versions use the command shown above.

## Using the tools

In Agent mode Cursor chooses tools automatically. You can ask explicitly, e.g. "use
finance.loan_payment". Keep the tool list small with `npx @rickrosten/agent-deterministic-tools disable <module>`
(Cursor limits the total number of active tools across servers).

## Troubleshooting

- `npx @rickrosten/agent-deterministic-tools doctor` checks both global and project `mcp.json`.
- Settings > MCP shows the server status; a red dot means it failed to start. Click it to
  see the logs, or run `npx -y @rickrosten/agent-deterministic-tools serve --debug` in a terminal.
