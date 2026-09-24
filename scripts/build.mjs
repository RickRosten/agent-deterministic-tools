#!/usr/bin/env node
// Builds workspaces in dependency order so that declaration files of
// upstream packages exist before downstream packages are bundled.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ORDER = [
  'packages/core',
  'packages/math',
  'packages/statistics',
  'packages/finance',
  'packages/datetime',
  'packages/units',
  'packages/mcp',
  'packages/openai',
  'packages/cli',
  'apps/server',
  'examples/acme-chemistry',
];

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

for (const dir of ORDER) {
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) continue;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (!pkg.scripts?.build) continue;
  console.log(`\n> building ${pkg.name}`);
  const res = spawnSync(npm, ['run', 'build', '-w', dir], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (res.status !== 0) process.exit(res.status ?? 1);
}
