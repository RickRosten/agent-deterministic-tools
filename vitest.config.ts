import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const r = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@rickrosten\/agent-deterministic-tools-(core|math|statistics|finance|datetime|units|mcp|openai)$/, replacement: r('./packages/$1/src/index.ts') },
      { find: /^@rickrosten\/agent-deterministic-tools$/, replacement: r('./packages/cli/src/index.ts') },
      { find: /^@acme\/chemistry$/, replacement: r('./examples/acme-chemistry/src/index.ts') },
    ],
  },
  test: {
    include: ['packages/*/tests/**/*.test.ts', 'examples/*/tests/**/*.test.ts', 'tests/**/*.test.ts', 'apps/*/tests/**/*.test.ts'],
    environment: 'node',
    pool: 'threads',
    testTimeout: 30_000,
    env: { TZ: 'Pacific/Kiritimati' },
  },
});
