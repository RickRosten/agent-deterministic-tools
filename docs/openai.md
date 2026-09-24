# OpenAI integration

There are two independent scenarios. The MCP implementation is not tied to OpenAI, and the
function-calling adapter does not use MCP.

## 1. MCP-compatible OpenAI environments

OpenAI's remote MCP support (Responses API `mcp` tool, Agents SDK, ChatGPT connectors) talks
to a **Streamable HTTP** endpoint reachable over HTTPS.

Run the endpoint:

```bash
# local test
npx @rickrosten/agent-deterministic-tools serve --http --port 3333 --auth-token "$TOKEN"

# deployment
docker build -f apps/server/Dockerfile -t deterministic-tools-server .
docker run -p 3333:3333 -e DETERMINISTIC_TOOLS_AUTH_TOKEN="$TOKEN" deterministic-tools-server
```

Put it behind HTTPS (reverse proxy, load balancer or a tunnel), e.g.
`https://mcp.example.com/mcp`.

Responses API:

```js
const response = await openai.responses.create({
  model: 'gpt-5',
  input: 'Monthly payment on 300,000 at 5.5% nominal monthly, 30 years, end of month?',
  tools: [
    {
      type: 'mcp',
      server_label: 'deterministic_tools',
      server_url: 'https://mcp.example.com/mcp',
      headers: { Authorization: `Bearer ${process.env.DT_TOKEN}` },
      require_approval: 'never',
      allowed_tools: ['finance.loan_payment', 'finance.total_interest'],
    },
  ],
});
```

Agents SDK (TypeScript):

```js
import { Agent, MCPServerStreamableHttp, run } from '@openai/agents';

const server = new MCPServerStreamableHttp({
  url: 'https://mcp.example.com/mcp',
  requestInit: { headers: { Authorization: `Bearer ${process.env.DT_TOKEN}` } },
});
await server.connect();
const agent = new Agent({ name: 'Calculator', mcpServers: [server] });
console.log((await run(agent, 'What is 17.5% of 2,340?')).finalOutput);
await server.close();
```

For connectors that require OAuth, configure authorization servers
([mcp.md](mcp.md#authentication)); the endpoint then publishes protected resource metadata.

## 2. Function calling

`@rickrosten/agent-deterministic-tools-openai` exposes the same tools as OpenAI function definitions and executes
the calls locally. No network hop, no MCP.

```bash
npm install @rickrosten/agent-deterministic-tools-core @rickrosten/agent-deterministic-tools-finance @rickrosten/agent-deterministic-tools-openai
```

### Responses API

```js
import OpenAI from 'openai';
import { createRegistry } from '@rickrosten/agent-deterministic-tools-core';
import { financeModule } from '@rickrosten/agent-deterministic-tools-finance';
import { runResponsesFunctionCalls, toResponsesTools } from '@rickrosten/agent-deterministic-tools-openai';

const registry = createRegistry([financeModule]);
const openai = new OpenAI();
let input = [{ role: 'user', content: 'NPV at 8% of -1000 now, then 300, 400, 500?' }];

while (true) {
  const response = await openai.responses.create({ model: 'gpt-5', input, tools: toResponsesTools(registry) });
  const outputs = await runResponsesFunctionCalls(registry, response.output);
  if (!outputs.length) { console.log(response.output_text); break; }
  input = [...input, ...response.output, ...outputs];
}
```

### Chat Completions

```js
import { runChatToolCalls, toChatCompletionsTools } from '@rickrosten/agent-deterministic-tools-openai';

const completion = await openai.chat.completions.create({ model, messages, tools: toChatCompletionsTools(registry) });
const message = completion.choices[0].message;
if (message.tool_calls) messages.push(message, ...(await runChatToolCalls(registry, message.tool_calls)));
```

### Agents SDK

```js
import { Agent, tool } from '@openai/agents';
import { toAgentsTools } from '@rickrosten/agent-deterministic-tools-openai';

const agent = new Agent({ name: 'Calculator', tools: toAgentsTools(registry, tool) });
```

### Details

- **Names.** OpenAI function names cannot contain dots: `finance.loan_payment` is sent as
  `finance__loan_payment` and mapped back automatically (`toOpenAIName` / `fromOpenAIName`).
- **Strict mode.** `toResponsesTools(registry, { strict: true })` converts schemas for
  structured outputs (all properties required, optional ones nullable). Pass
  `{ strict: true }` to the executor as well; it drops the resulting `null`s before
  validation.
- **Errors.** The executor never throws; errors go back to the model as
  `{"error": {"code", "message", "field"}}` so it can correct its call.
- **Without Node.js.** `npx @rickrosten/agent-deterministic-tools schema --format openai-responses` (or
  `openai-chat`) prints the definitions as JSON.

Complete runnable examples: [examples/openai-agents](../examples/openai-agents).
