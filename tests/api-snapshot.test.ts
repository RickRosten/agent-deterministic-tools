import { describe, expect, it } from 'vitest';
import { createRegistry } from '@rickrosten/agent-deterministic-tools-core';
import { BUILTIN_MODULES } from '@rickrosten/agent-deterministic-tools';

/**
 * The tool API (names, input schemas, output schemas) is public API. Any change to this
 * snapshot is potentially breaking: review the diff, bump the module version according to
 * semver and add a changeset. Regenerate with `npm run api:snapshot`.
 */
describe('public tool API', () => {
  it('matches the committed snapshot', async () => {
    const registry = createRegistry(BUILTIN_MODULES);
    const api = {
      modules: registry.listModules().map((m) => ({ id: m.id, version: m.version, tools: m.tools })),
      tools: registry.describeAll().map((d) => ({
        name: d.name,
        moduleVersion: d.moduleVersion,
        inputSchema: d.inputSchema,
        outputSchema: d.outputSchema,
      })),
    };
    await expect(`${JSON.stringify(api, null, 2)}\n`).toMatchFileSnapshot('../api/tools.snapshot.json');
  });
});
