#!/usr/bin/env node
// Validates every publishable workspace package before release:
// - publint (exports/types/files correctness, strict mode)
// - `npm pack --dry-run` contents (built entry points and declarations are shipped)
// - required package.json metadata
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { publint } from 'publint';
import { formatMessage } from 'publint/utils';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const REQUIRED_FIELDS = ['name', 'version', 'description', 'license', 'type', 'exports', 'files', 'engines', 'repository'];
let failed = false;

const fail = (pkg, message) => {
  failed = true;
  console.error(`  x ${pkg}: ${message}`);
};

const dirs = readdirSync('packages').map((d) => join('packages', d));

for (const dir of dirs) {
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) continue;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (pkg.private) continue;
  console.log(`> ${pkg.name}@${pkg.version}`);

  for (const field of REQUIRED_FIELDS) if (pkg[field] === undefined) fail(pkg.name, `missing "${field}" in package.json`);
  if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(pkg.version)) fail(pkg.name, `version "${pkg.version}" is not semver`);
  if (pkg.engines?.node !== '>=20') fail(pkg.name, 'engines.node must be ">=20"');

  const { messages, pkg: resolved } = await publint({ pkgDir: dir, level: 'warning', strict: true, pack: 'npm' });
  for (const m of messages) fail(pkg.name, `publint ${m.type}: ${formatMessage(m, resolved) ?? m.code}`);

  const pack = spawnSync(npm, ['pack', '--dry-run', '--json'], { cwd: dir, encoding: 'utf8', shell: process.platform === 'win32' });
  if (pack.status !== 0) {
    fail(pkg.name, `npm pack failed: ${pack.stderr}`);
    continue;
  }
  const files = new Set(JSON.parse(pack.stdout)[0].files.map((f) => f.path.replace(/\\/g, '/')));
  for (const required of ['package.json', 'README.md', 'dist/index.js', 'dist/index.d.ts']) {
    if (!files.has(required)) fail(pkg.name, `tarball is missing ${required}`);
  }
  for (const bin of Object.values(pkg.bin ?? {})) {
    const path = bin.replace(/^\.\//, '');
    if (!files.has(path)) fail(pkg.name, `tarball is missing bin ${path}`);
    else if (!readFileSync(join(dir, path), 'utf8').startsWith('#!/usr/bin/env node')) fail(pkg.name, `bin ${path} has no node shebang`);
  }
  if ([...files].some((f) => f.startsWith('src/') || f.startsWith('tests/'))) fail(pkg.name, 'tarball contains sources or tests');
  console.log(`  ok (${files.size} files)`);
}

if (failed) {
  console.error('\nPackage validation failed.');
  process.exit(1);
}
console.log('\nAll packages valid.');
