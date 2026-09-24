import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertValidModule, type Module } from '@rickrosten/agent-deterministic-tools-core';

export interface LoadedPlugin {
  specifier: string;
  resolvedPath: string;
  modules: Module[];
}

export class PluginError extends Error {
  constructor(
    readonly specifier: string,
    message: string,
  ) {
    super(message);
    this.name = 'PluginError';
  }
}

function isPathSpecifier(spec: string): boolean {
  return spec.startsWith('.') || isAbsolute(spec) || spec.startsWith('file:');
}

function pickExport(exportsField: unknown): string | undefined {
  if (typeof exportsField === 'string') return exportsField;
  if (!exportsField || typeof exportsField !== 'object') return undefined;
  const record = exportsField as Record<string, unknown>;
  const root = '.' in record ? record['.'] : record;
  if (typeof root === 'string') return root;
  if (root && typeof root === 'object') {
    const conditions = root as Record<string, unknown>;
    for (const key of ['import', 'node', 'default']) {
      const v = conditions[key];
      if (typeof v === 'string') return v;
      if (v && typeof v === 'object') {
        const nested = pickExport({ '.': v });
        if (nested) return nested;
      }
    }
  }
  return undefined;
}

/** Entry file of a package directory (exports > module > main > index.js). */
export function packageEntry(pkgDir: string): string | undefined {
  const pkgJson = join(pkgDir, 'package.json');
  if (!existsSync(pkgJson)) return undefined;
  const pkg = JSON.parse(readFileSync(pkgJson, 'utf8')) as Record<string, unknown>;
  const entry =
    pickExport(pkg['exports']) ??
    (typeof pkg['module'] === 'string' ? pkg['module'] : undefined) ??
    (typeof pkg['main'] === 'string' ? pkg['main'] : 'index.js');
  const file = resolve(pkgDir, entry);
  return existsSync(file) ? file : undefined;
}

/** Resolves an npm package entry point from a list of directories containing node_modules. */
export function resolvePackage(specifier: string, searchDirs: readonly string[]): string | undefined {
  for (const dir of searchDirs) {
    const file = packageEntry(join(dir, 'node_modules', ...specifier.split('/')));
    if (file) return file;
  }
  return undefined;
}

function looksLikeModule(value: unknown): value is Module {
  return !!value && typeof value === 'object' && 'id' in value && 'tools' in value && Array.isArray((value as Module).tools);
}

/** Extracts modules from a plugin's exports: default, `module`, `modules`, or any exported module objects. */
export function modulesFromExports(ns: Record<string, unknown>): Module[] {
  const candidates: unknown[] = [];
  const def = ns['default'];
  if (Array.isArray(def)) candidates.push(...def);
  else if (looksLikeModule(def)) candidates.push(def);
  if (!candidates.length && Array.isArray(ns['modules'])) candidates.push(...(ns['modules'] as unknown[]));
  if (!candidates.length && looksLikeModule(ns['module'])) candidates.push(ns['module']);
  if (!candidates.length) candidates.push(...Object.values(ns).filter(looksLikeModule));
  const unique = [...new Set(candidates)];
  for (const m of unique) assertValidModule(m);
  return unique as Module[];
}

const cliDir = dirname(fileURLToPath(import.meta.url));

/**
 * Directories above the CLI's own dist folder. Covers the package itself and the project that
 * installed it, e.g. <project>/node_modules/@rickrosten/agent-deterministic-tools/dist.
 */
function cliAncestors(): string[] {
  const dirs: string[] = [];
  let dir = cliDir;
  for (let i = 0; i < 5; i++) {
    const parent = dirname(dir);
    if (parent === dir) break;
    dirs.push(parent);
    dir = parent;
  }
  return dirs;
}

/**
 * Loads an explicitly configured plugin. Only specifiers listed by the user are ever loaded;
 * there is no scanning of node_modules.
 */
export async function loadPlugin(specifier: string, options: { configDir: string; cwd: string }): Promise<LoadedPlugin> {
  let resolvedPath: string | undefined;
  if (isPathSpecifier(specifier)) {
    const p = specifier.startsWith('file:') ? fileURLToPath(specifier) : resolve(options.cwd, specifier);
    if (existsSync(p)) resolvedPath = statSync(p).isDirectory() ? packageEntry(p) : p;
    if (existsSync(p) && !resolvedPath) {
      throw new PluginError(specifier, `Plugin directory "${specifier}" has no built entry point (run its build first).`);
    }
  } else {
    resolvedPath = resolvePackage(specifier, [options.configDir, options.cwd, ...cliAncestors()]);
  }
  if (!resolvedPath) {
    throw new PluginError(
      specifier,
      `Plugin "${specifier}" is not installed. Run: deterministic-tools plugin add ${specifier}`,
    );
  }
  let ns: Record<string, unknown>;
  try {
    ns = (await import(pathToFileURL(resolvedPath).href)) as Record<string, unknown>;
  } catch (error) {
    throw new PluginError(specifier, `Plugin "${specifier}" failed to load: ${error instanceof Error ? error.message : String(error)}`);
  }
  let modules: Module[];
  try {
    modules = modulesFromExports(ns);
  } catch (error) {
    throw new PluginError(specifier, `Plugin "${specifier}" exports an invalid module: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!modules.length) throw new PluginError(specifier, `Plugin "${specifier}" does not export any module (export default defineModule(...)).`);
  return { specifier, resolvedPath, modules };
}
