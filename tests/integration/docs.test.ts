import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { run } from '@rickrosten/agent-deterministic-tools';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('generated documentation', () => {
  it('docs/tools.md is up to date with tool metadata (run `npm run build && npm run docs:tools`)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dt-docs-'));
    let out = '';
    try {
      await run(['--config', join(dir, 'none.json'), 'list', '--all', '--format', 'markdown'], {
        env: {
          platform: 'linux',
          homedir: dir,
          cwd: dir,
          env: {},
          stdout: { write: (s: string) => (out += s) },
          stderr: { write: () => true },
          stdinIsTTY: false,
          nodeVersion: process.versions.node,
          binPath: undefined,
        },
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(out).toBe(readFileSync(join(root, 'docs/tools.md'), 'utf8'));
  });
});
