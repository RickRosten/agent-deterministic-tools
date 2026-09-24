# @rickrosten/agent-deterministic-tools

Exact calculations for AI agents, served as a local MCP server.

```text
LLM  ->  deterministic tool  ->  exact result
```

```bash
npx @rickrosten/agent-deterministic-tools
```

The interactive setup detects your environment, lets you pick modules (math, finance,
statistics, datetime, units), writes the configuration and connects Claude Desktop, Cursor
or Claude Code. No global install and no manual JSON editing are needed.

## Commands

```bash
deterministic-tools                 # setup wizard (in a terminal) / stdio server (when spawned by a client)
deterministic-tools serve           # MCP over stdio
deterministic-tools serve --http    # MCP over Streamable HTTP on http://127.0.0.1:3333/mcp
deterministic-tools list            # tools of enabled modules
deterministic-tools modules         # modules and status
deterministic-tools enable finance  # enable / disable modules
deterministic-tools disable finance
deterministic-tools install claude  # claude | cursor [--scope project] | claude-code
deterministic-tools doctor          # Node.js, config, modules, client configs, server start, tool calls
deterministic-tools config          # show | path | init | validate
deterministic-tools call math.sum '{"values":[0.1,0.2]}'
deterministic-tools schema --format openai-responses
deterministic-tools plugin add @acme/chemistry
deterministic-tools --debug ...     # execution logs on stderr (no input values unless --log-inputs)
```

Documentation: https://github.com/RickRosten/agent-deterministic-tools#readme
