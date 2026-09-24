import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'));

describe('MCP Registry metadata (server.json)', () => {
  const server = read('server.json');
  const cli = read('packages/cli/package.json');

  it('matches the CLI package name, mcpName and version', () => {
    expect(cli.mcpName).toBe(server.name);
    expect(server.version).toBe(cli.version);
    expect(server.packages).toEqual([
      expect.objectContaining({ registryType: 'npm', identifier: cli.name, version: cli.version, transport: { type: 'stdio' } }),
    ]);
  });

  it('respects registry limits', () => {
    expect(server.name).toMatch(/^io\.github\.[a-z0-9-]+\/[a-z0-9._-]+$/);
    expect(server.description.length).toBeLessThanOrEqual(100);
    expect(server.repository.url).toBe(cli.repository.url.replace(/^git\+/, '').replace(/\.git$/, ''));
  });
});
