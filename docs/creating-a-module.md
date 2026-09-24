# Creating a module

Third-party modules plug in without changing core. A complete example lives in
[examples/acme-chemistry](../examples/acme-chemistry) (`chemistry.molar_mass`,
`chemistry.molarity`, `chemistry.dilution`).

## Layout

```text
my-module/
├── src/
│   ├── index.ts        # exports the module
│   └── tools/          # one file per tool or group
├── tests/
├── package.json
└── README.md
```

## package.json

```json
{
  "name": "@acme/chemistry",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "files": ["dist"],
  "keywords": ["deterministic-tools-module"],
  "peerDependencies": { "@rickrosten/agent-deterministic-tools-core": "^1.0.0" },
  "devDependencies": { "@rickrosten/agent-deterministic-tools-core": "^1.0.0", "tsup": "^8", "typescript": "^5", "vitest": "^3" },
  "scripts": { "build": "tsup src/index.ts --format esm --dts --clean", "test": "vitest run" }
}
```

Declare `@rickrosten/agent-deterministic-tools-core` as a **peer dependency** so the host's core (and its `zod`) is
used. Use the `deterministic-tools-module` keyword so modules are discoverable on npm.

## Creating the module

```ts
// src/index.ts
import { defineModule } from '@rickrosten/agent-deterministic-tools-core';
import { dilution, molarMass, molarity } from './tools/index.js';

export const chemistryModule = defineModule({
  id: 'chemistry',               // namespace: chemistry.molar_mass
  name: 'Chemistry',
  version: '1.0.0',              // semver of the module's tool API
  description: 'Molar mass, molarity and dilution calculations.',
  tools: [molarMass, molarity, dilution],
});

export default chemistryModule;
```

Rules:

- `id`: lowercase letters, digits, `-`, `_`; it must not clash with other modules
  (`math`, `finance`, `statistics`, `datetime`, `units` are taken).
- `version`: semver. Changing a tool name, input schema, output schema or meaning is a
  breaking change for the agents using it.
- Do not mutate global state or depend on other modules.
- Export the module as `default` (or as named export `module`, or an array of modules).

Tools are created with `defineTool`; see [creating a tool](creating-a-tool.md).

## Testing the module

```ts
import { createRegistry } from '@rickrosten/agent-deterministic-tools-core';
import { chemistryModule } from '../src/index.js';

const registry = createRegistry([chemistryModule]);
await registry.execute('chemistry.molar_mass', { formula: 'H2O' });
```

To test the MCP surface as a client would see it:

```ts
import { connectInMemory } from '@rickrosten/agent-deterministic-tools-mcp';
const { client, close } = await connectInMemory(registry);
await client.listTools();
await client.callTool({ name: 'chemistry.molar_mass', arguments: { formula: 'H2O' } });
await close();
```

## Publishing a module

```bash
npm run build && npm test
npm publish --access public
```

Any npm scope works (`@acme/*`). The official registry scope is `@rickrosten/agent-deterministic-tools-*`.

## Registering a module

**With the CLI (end users).** Plugins must be allowed explicitly:

```bash
npx @rickrosten/agent-deterministic-tools plugin add @acme/chemistry   # npm install into the config directory + allow
npx @rickrosten/agent-deterministic-tools plugin add ./path/to/dist/index.js   # local build
npx @rickrosten/agent-deterministic-tools modules                       # chemistry is listed and enabled
```

This adds the package to `plugins` in the configuration. Nothing that is not listed there is
ever loaded.

**In code (developers).**

```ts
import { createRegistry } from '@rickrosten/agent-deterministic-tools-core';
import { mathModule } from '@rickrosten/agent-deterministic-tools-math';
import { serveStdio } from '@rickrosten/agent-deterministic-tools-mcp';
import chemistry from '@acme/chemistry';

await serveStdio(createRegistry([mathModule, chemistry]));
```
