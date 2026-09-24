# OpenAI examples

Three ways to give OpenAI models the same deterministic tools without MCP:

| File | API |
| --- | --- |
| `responses.mjs` | Responses API with `toResponsesTools` + `runResponsesFunctionCalls` |
| `chat-completions.mjs` | Chat Completions with `toChatCompletionsTools` + `runChatToolCalls` |
| `agents.mjs` | Agents SDK with `toAgentsTools(registry, tool)` |

```bash
cd examples/openai-agents
npm install
export OPENAI_API_KEY=...
npm run responses
```

For MCP-capable OpenAI environments, use the Streamable HTTP endpoint instead
(`npx @rickrosten/agent-deterministic-tools serve --http`), see [docs/openai.md](../../docs/openai.md).
