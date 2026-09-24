import { dirname } from 'node:path';
import { ToolRegistry, type ExecutionObserver } from '@rickrosten/agent-deterministic-tools-core';
import { BUILTIN_MODULES } from './builtins.js';
import type { Config } from './config.js';
import { loadPlugin, type LoadedPlugin } from './plugins.js';

export interface ModuleSource {
  id: string;
  source: 'builtin' | 'plugin';
  plugin?: string;
}

export interface BuiltRegistry {
  registry: ToolRegistry;
  sources: ModuleSource[];
  plugins: LoadedPlugin[];
  warnings: string[];
  errors: string[];
}

export interface BuildRegistryOptions {
  configPath: string;
  cwd: string;
  observer?: ExecutionObserver;
}

/**
 * Registers all built-in modules and explicitly configured plugins, then enables exactly
 * the configured modules (all of them when `modules` is omitted).
 */
export async function buildRegistry(config: Config, options: BuildRegistryOptions): Promise<BuiltRegistry> {
  const registry = new ToolRegistry({
    logInputs: config.logInputs ?? false,
    ...(options.observer ? { observer: options.observer } : {}),
  });
  const sources: ModuleSource[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const plugins: LoadedPlugin[] = [];

  for (const m of BUILTIN_MODULES) {
    registry.register(m, { enabled: false });
    sources.push({ id: m.id, source: 'builtin' });
  }

  for (const spec of config.plugins ?? []) {
    try {
      const plugin = await loadPlugin(spec, { configDir: dirname(options.configPath), cwd: options.cwd });
      plugins.push(plugin);
      for (const m of plugin.modules) {
        try {
          registry.register(m, { enabled: false });
          sources.push({ id: m.id, source: 'plugin', plugin: spec });
        } catch (error) {
          errors.push(`Plugin "${spec}": ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  const enabled = config.modules ?? sources.map((s) => s.id);
  for (const id of enabled) {
    if (registry.hasModule(id)) registry.enableModule(id);
    else warnings.push(`Unknown module "${id}" in configuration (available: ${sources.map((s) => s.id).join(', ')}).`);
  }
  for (const tool of config.disabledTools ?? []) {
    if (registry.has(tool)) registry.disableTool(tool);
    else warnings.push(`Unknown tool "${tool}" in disabledTools.`);
  }
  return { registry, sources, plugins, warnings, errors };
}
