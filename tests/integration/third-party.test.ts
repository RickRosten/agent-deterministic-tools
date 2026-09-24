import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createRegistry, defineModule, RegistryError } from '@rickrosten/agent-deterministic-tools-core';
import { connectInMemory } from '@rickrosten/agent-deterministic-tools-mcp';
import { toResponsesTools } from '@rickrosten/agent-deterministic-tools-openai';
import chemistry from '@acme/chemistry';
import { BUILTIN_MODULES, run } from '@rickrosten/agent-deterministic-tools';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const exampleDir = join(root, 'examples/acme-chemistry');
const exampleBuilt = existsSync(join(exampleDir, 'dist/index.js'));

describe('third-party module (@acme/chemistry)', () => {
  it('registers next to built-in modules without changes to core', () => {
    const registry = createRegistry([...BUILTIN_MODULES, chemistry]);
    expect(registry.list().filter((t) => t.moduleId === 'chemistry').map((t) => t.name)).toEqual([
      'chemistry.molar_mass',
      'chemistry.molarity',
      'chemistry.dilution',
    ]);
  });

  it('is exposed over MCP and OpenAI like any built-in tool', async () => {
    const registry = createRegistry([...BUILTIN_MODULES, chemistry]);
    const { client, close } = await connectInMemory(registry);
    try {
      const names = (await client.listTools()).tools.map((t) => t.name);
      expect(names).toContain('chemistry.molar_mass');
      const res = await client.callTool({ name: 'chemistry.molar_mass', arguments: { formula: 'C6H12O6' } });
      expect(res.structuredContent).toMatchObject({ result: 180.156, unit: 'g/mol' });
    } finally {
      await close();
    }
    expect(toResponsesTools(registry, { include: ['chemistry'] }).map((t) => t.name)).toEqual([
      'chemistry__molar_mass',
      'chemistry__molarity',
      'chemistry__dilution',
    ]);
  });

  it('cannot shadow a built-in module', () => {
    const impostor = defineModule({ id: 'math', name: 'Fake', version: '1.0.0', description: 'x', tools: [] });
    expect(() => createRegistry([...BUILTIN_MODULES, impostor])).toThrow(RegistryError);
  });

  it.skipIf(!exampleBuilt)('can be allowed as a plugin through the CLI', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dt-plugin-'));
    mkdirSync(join(dir, 'home'));
    let out = '';
    const env = {
      platform: process.platform,
      homedir: join(dir, 'home'),
      cwd: dir,
      env: {},
      stdout: { write: (s: string) => (out += s) },
      stderr: { write: () => true },
      stdinIsTTY: false,
      nodeVersion: process.versions.node,
      binPath: undefined,
    };
    try {
      expect(await run(['plugin', 'add', exampleDir, '--no-install'], { env })).toBe(0);
      out = '';
      expect(await run(['call', 'chemistry.dilution', '{"c1":2,"c2":0.5,"v2":200}'], { env })).toBe(0);
      expect(JSON.parse(out)).toEqual({ result: 50, solvedFor: 'v1' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
