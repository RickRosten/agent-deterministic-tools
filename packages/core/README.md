# @rickrosten/agent-deterministic-tools-core

Core abstractions for [Deterministic Tools](../../README.md): `defineTool`, `defineModule`,
`ToolRegistry`, validation and structured errors. Transport-agnostic: no MCP, HTTP or OpenAI
dependencies.

```bash
npm install @rickrosten/agent-deterministic-tools-core
```

```ts
import { defineTool, defineModule, createRegistry, z } from '@rickrosten/agent-deterministic-tools-core';

const double = defineTool({
  name: 'double',
  description: 'Multiplies a number by two.',
  input: z.strictObject({ value: z.number() }),
  output: z.object({ result: z.number() }),
  execute: ({ value }) => ({ result: value * 2 }),
});

const registry = createRegistry([
  defineModule({ id: 'demo', name: 'Demo', version: '1.0.0', description: 'Demo tools', tools: [double] }),
]);

await registry.execute('demo.double', { value: 21 });
// { ok: true, data: { result: 42 } }
```

See [docs/creating-a-tool.md](../../docs/creating-a-tool.md).
