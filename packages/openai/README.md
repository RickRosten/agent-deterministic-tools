# @rickrosten/agent-deterministic-tools-openai

Use Deterministic Tools as OpenAI function tools (Chat Completions, Responses API, Agents SDK)
without MCP. No dependency on the `openai` package.

```ts
import { createRegistry } from '@rickrosten/agent-deterministic-tools-core';
import { financeModule } from '@rickrosten/agent-deterministic-tools-finance';
import { toResponsesTools, runResponsesFunctionCalls } from '@rickrosten/agent-deterministic-tools-openai';

const registry = createRegistry([financeModule]);
const response = await openai.responses.create({ model, input, tools: toResponsesTools(registry) });
const outputs = await runResponsesFunctionCalls(registry, response.output); // function_call_output items
```

- Names: `finance.loan_payment` is exposed as `finance__loan_payment` (OpenAI names cannot
  contain dots) and mapped back automatically.
- `strict: true` produces structured-output compatible schemas (optional fields become
  nullable); pass `strict: true` to the executor too so nulls are removed before validation.
- Tool errors are returned to the model as `{"error": {"code", "message", "field"}}`.
- Agents SDK: `toAgentsTools(registry, tool)` with `tool` imported from `@openai/agents`.

See [docs/openai.md](../../docs/openai.md) and [examples/openai-agents](../../examples/openai-agents).
