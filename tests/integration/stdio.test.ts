import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

const bin = resolve(dirname(fileURLToPath(import.meta.url)), '../../packages/cli/dist/bin.js');
const built = existsSync(bin);
if (!built && process.env['REQUIRE_BUILD']) throw new Error(`REQUIRE_BUILD is set but ${bin} does not exist; run npm run build`);

const dir = mkdtempSync(join(tmpdir(), 'dt-stdio-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function connect(configPath: string) {
  const client = new Client({ name: 'integration', version: '1.0.0' });
  const env = Object.fromEntries(Object.entries(process.env).filter((kv): kv is [string, string] => kv[1] !== undefined));
  await client.connect(
    new StdioClientTransport({ command: process.execPath, args: [bin, 'serve', '--config', configPath], env, stderr: 'ignore' }) as Transport,
  );
  return client;
}

describe.skipIf(!built)('stdio transport (built CLI)', () => {
  it('serves every enabled tool and answers tools/call', async () => {
    const config = join(dir, 'all.json');
    const client = await connect(config);
    try {
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(43);
      const res = await client.callTool({ name: 'units.convert', arguments: { value: 100, from: 'km/h', to: 'm/s' } });
      expect(res.structuredContent).toMatchObject({ result: 27.77777777777778, category: 'speed' });
      const err = await client.callTool({ name: 'datetime.day_of_week', arguments: { date: '2026-02-30' } });
      expect(err.isError).toBe(true);
      expect(JSON.parse((err.content as Array<{ text: string }>)[0]!.text)).toMatchObject({ error: { code: 'INVALID_DATE', field: 'date' } });
    } finally {
      await client.close();
    }
  });

  it('publishes only tools of modules enabled in the configuration', async () => {
    const config = join(dir, 'math-only.json');
    writeFileSync(config, JSON.stringify({ modules: ['math'], disabledTools: ['math.power'] }));
    const client = await connect(config);
    try {
      const names = (await client.listTools()).tools.map((t) => t.name);
      expect(names).toHaveLength(12);
      expect(names.every((n) => n.startsWith('math.'))).toBe(true);
      expect(names).not.toContain('math.power');
    } finally {
      await client.close();
    }
  });
});
