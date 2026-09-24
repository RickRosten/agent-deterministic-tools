# Publishing and distribution

How to release Deterministic Tools and make it available to every agent platform.

```text
npm (@rickrosten/agent-deterministic-tools*)   <- everything local builds on this
 ├── Claude Desktop / Claude Code / Cursor / VS Code / Windsurf / Codex / Gemini CLI   (stdio via npx)
 ├── MCP Registry (registry.modelcontextprotocol.io) -> discovery in clients and directories
 └── OpenAI API / Agents SDK function calling (@rickrosten/agent-deterministic-tools-openai)

Docker image (apps/server) on a public HTTPS host        <- remote clients
 ├── ChatGPT (developer mode connectors)
 ├── Claude.ai custom connectors
 └── OpenAI Responses API / Agents SDK remote MCP
```

## 1. npm

### One-time setup

1. Create an npm account at <https://www.npmjs.com/signup> with the username **`rickrosten`**
   (a user named `rickrosten` owns the `@rickrosten` scope). Alternatively create an
   organization named `rickrosten` under an existing account. Scope names are always
   lowercase on npm.
2. Enable two-factor authentication (Account > Two-Factor Authentication).
3. Create a publish token for GitHub Actions: avatar > **Access Tokens** > **Generate New
   Token** > **Granular Access Token**:
   - Packages and scopes: **Read and write**, select **All packages** (for the very first
     release the packages do not exist yet; after that you can restrict it to the
     `@rickrosten` scope);
   - allow publishing without 2FA prompts (needed for CI);
   - expiration: the maximum npm allows (write tokens are short-lived, renew them before they expire).
4. GitHub: repository **Settings > Secrets and variables > Actions > New repository secret**,
   name `NPM_TOKEN`, value = the token.

### First release (1.0.0)

The release workflow publishes every package whose version is not on npm yet:

- GitHub > **Actions > Release > Run workflow** (or push any commit to `main`).

It builds, tests, publishes the 9 public packages with provenance, pushes a tag per package
and creates GitHub releases. Check the result:

```bash
npm view @rickrosten/agent-deterministic-tools version
npx -y @rickrosten/agent-deterministic-tools doctor
```

Manual alternative (from your machine): `npm login`, `npm run build`, `npx changeset publish`.

### Later releases

1. In a pull request run `npx changeset`, choose packages and bump, commit the generated file.
2. After merging, the workflow opens a **"chore(release): version packages"** pull request
   (versions, `CHANGELOG.md`, `server.json`).
3. Merging it publishes to npm and to the MCP Registry.

### Optional: Trusted Publishing (no token)

After the first release, for **each** package on npmjs.com: package > **Settings > Trusted
Publisher > GitHub Actions**, owner `RickRosten`, repository `agent-deterministic-tools`,
workflow `release.yml`. Then the `NPM_TOKEN` secret can be deleted; the workflow already
installs an npm version that supports OIDC.

## 2. MCP Registry

The official registry (`registry.modelcontextprotocol.io`) is what clients and directories
use for discovery. Metadata lives in [`server.json`](../server.json); `mcpName` in
`packages/cli/package.json` proves ownership of the npm package.

- **Automatic:** the release workflow publishes `server.json` after a successful npm release
  (GitHub OIDC login, no secret needed).
- **Manual** (first time, or if the step failed):

  ```bash
  # macOS / Linux
  brew install mcp-publisher
  # or: curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" | tar xz mcp-publisher

  mcp-publisher login github      # browser login as RickRosten
  mcp-publisher publish           # run in the repository root, after the npm release
  ```

- Verify: `curl "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.rickrosten/agent-deterministic-tools"`.

The npm package must be published first; the registry checks that its `mcpName` matches.

## 3. Local clients (stdio)

All of them run the same command:

```text
npx -y @rickrosten/agent-deterministic-tools serve
```

On Windows GUI apps use `cmd /c npx -y @rickrosten/agent-deterministic-tools serve`.

| Client | Easiest way for a user |
| --- | --- |
| Claude Desktop | `npx @rickrosten/agent-deterministic-tools install claude`, restart Claude |
| Claude Code | `claude mcp add --scope user deterministic-tools -- npx -y @rickrosten/agent-deterministic-tools serve` |
| Cursor | "Add to Cursor" link below, or `npx @rickrosten/agent-deterministic-tools install cursor` |
| VS Code (GitHub Copilot agent mode) | "Install in VS Code" link below, or `code --add-mcp '{"name":"deterministic-tools","command":"npx","args":["-y","@rickrosten/agent-deterministic-tools","serve"]}'` |
| Windsurf | add to `~/.codeium/windsurf/mcp_config.json` (snippet below) |
| OpenAI Codex CLI | `codex mcp add deterministic-tools -- npx -y @rickrosten/agent-deterministic-tools serve` |
| Gemini CLI | add to `~/.gemini/settings.json` (snippet below) |
| Anything else | `npx @rickrosten/agent-deterministic-tools` (wizard) or the JSON snippet |

Generic `mcpServers` snippet (Claude Desktop, Cursor, Windsurf, Gemini CLI, most clients):

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

VS Code uses `servers` instead of `mcpServers` (`.vscode/mcp.json`):

```json
{ "servers": { "deterministic-tools": { "type": "stdio", "command": "npx", "args": ["-y", "@rickrosten/agent-deterministic-tools", "serve"] } } }
```

Codex CLI (`~/.codex/config.toml`):

```toml
[mcp_servers.deterministic-tools]
command = "npx"
args = ["-y", "@rickrosten/agent-deterministic-tools", "serve"]
```

### One-click install links (for the README)

- Cursor: <https://cursor.com/en/install-mcp?name=deterministic-tools&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkByaWNrcm9zdGVuL2FnZW50LWRldGVybWluaXN0aWMtdG9vbHMiLCJzZXJ2ZSJdfQ%3D%3D>
- VS Code: <https://insiders.vscode.dev/redirect/mcp/install?name=deterministic-tools&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40rickrosten%2Fagent-deterministic-tools%22%2C%22serve%22%5D%7D>

`npx @rickrosten/agent-deterministic-tools install cursor --print` regenerates the Cursor link.

### Claude Desktop extension (optional)

Claude Desktop can install `.mcpb` bundles with one click (no Node.js knowledge needed):
`npx @anthropic-ai/mcpb init` in an empty folder, point the manifest's server entry at the
published package, `npx @anthropic-ai/mcpb pack`, attach the `.mcpb` file to the GitHub
release. Anthropic's extension directory accepts submissions through its submission form.

## 4. Remote endpoint (ChatGPT, Claude.ai, OpenAI API)

Remote clients need a public **HTTPS** URL. Deploy the Docker image from `apps/server`.

### Fly.io (example)

```bash
fly auth login
fly launch --no-deploy --name agent-deterministic-tools --dockerfile apps/server/Dockerfile --internal-port 3333
fly secrets set DETERMINISTIC_TOOLS_AUTH_TOKEN="$(openssl rand -hex 32)" PUBLIC_URL="https://agent-deterministic-tools.fly.dev"
fly deploy
curl https://agent-deterministic-tools.fly.dev/healthz     # {"status":"ok","tools":43}
```

MCP endpoint: `https://agent-deterministic-tools.fly.dev/mcp`.

Render / Railway / Cloud Run work the same way: Docker build from the repository root with
`apps/server/Dockerfile`, port `3333`, the environment variables from
[apps/server/README.md](../apps/server/README.md).

### Authentication choices

| Client | Supported auth | Configure the server with |
| --- | --- | --- |
| OpenAI Responses API / Agents SDK | custom headers | `DETERMINISTIC_TOOLS_AUTH_TOKEN` (send `Authorization: Bearer ...`) |
| ChatGPT connectors, Claude.ai custom connectors | OAuth or none | OAuth: `AUTHORIZATION_SERVERS` + a token validator; or no auth: `DETERMINISTIC_TOOLS_ALLOW_UNAUTHENTICATED=true` |

The tools are pure computation without data access, so an unauthenticated endpoint mainly
risks resource usage; put rate limiting in front of it (Fly/Cloudflare) if you open it up.

### ChatGPT

Settings > **Apps & Connectors** > Advanced > enable **Developer mode**, then **Create**
connector: name "Deterministic Tools", MCP server URL `https://<host>/mcp`, authentication
per the table above. Use it in a chat via the tools/connectors menu.

### Claude.ai (web and apps)

Settings > **Connectors** > **Add custom connector** > URL `https://<host>/mcp`
(Pro, Max, Team and Enterprise plans).

### OpenAI API

Remote MCP (Responses API):

```js
tools: [{
  type: 'mcp',
  server_label: 'deterministic_tools',
  server_url: 'https://<host>/mcp',
  headers: { Authorization: `Bearer ${process.env.DT_TOKEN}` },
  require_approval: 'never',
}]
```

Or without a server: function calling with `@rickrosten/agent-deterministic-tools-openai`
([openai.md](openai.md#2-function-calling)).

## 5. Directories

After npm + MCP Registry are live:

| Directory | How |
| --- | --- |
| PulseMCP and other registry mirrors | picked up from the MCP Registry automatically |
| Glama (glama.ai/mcp/servers) | indexes public GitHub MCP repos; claim the listing with your GitHub account |
| Smithery (smithery.ai) | "Add server", connect the GitHub repo |
| mcp.so | "Submit" form with the GitHub URL |
| cursor.directory | submit via the site ("Submit MCP") |
| awesome-mcp-servers | pull request to github.com/punkpeye/awesome-mcp-servers (category "Finance" or "Other tools") |

Add to the GitHub repository: description, website (npm page), topics `mcp`, `mcp-server`,
`ai-agents`, `calculator`, `finance`, `claude`, `cursor`, `openai`.
