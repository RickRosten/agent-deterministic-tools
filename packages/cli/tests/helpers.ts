import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CliEnvironment } from '@rickrosten/agent-deterministic-tools';

export interface TestEnv extends CliEnvironment {
  root: string;
  output(): string;
  errors(): string;
  cleanup(): void;
}

export function testEnv(overrides: Partial<CliEnvironment> = {}): TestEnv {
  const root = mkdtempSync(join(tmpdir(), 'dt-cli-'));
  const home = join(root, 'home');
  const cwd = join(root, 'project');
  mkdirSync(home, { recursive: true });
  mkdirSync(cwd, { recursive: true });
  let out = '';
  let err = '';
  return {
    platform: 'linux',
    homedir: home,
    cwd,
    env: { PATH: '' },
    stdout: { write: (s: string) => (out += s), isTTY: false },
    stderr: { write: (s: string) => (err += s), isTTY: false },
    stdinIsTTY: false,
    nodeVersion: '22.16.0',
    binPath: undefined,
    ...overrides,
    root,
    output: () => out,
    errors: () => err,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
