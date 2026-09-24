import { connectInMemory } from '@rickrosten/agent-deterministic-tools-mcp';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { BUILTIN_MODULE_IDS } from './builtins.js';
import { ConfigError, loadConfig, type Config } from './config.js';
import type { CliEnvironment } from './environment.js';
import { INTEGRATIONS, integrationStatus } from './integrations.js';
import { buildRegistry } from './registry.js';

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface Check {
  name: string;
  status: CheckStatus;
  message: string;
}

export interface DoctorOptions {
  configPath: string;
  /** How to launch the stdio server for the end-to-end check; omitted = skip. */
  stdioCommand?: { command: string; args: string[] } | undefined;
  timeoutMs?: number;
}

export const MIN_NODE_MAJOR = 20;

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms);
    }),
  ]);
}

/** Runs all health checks. Never throws; every problem becomes a failed check. */
export async function runDoctor(e: CliEnvironment, options: DoctorOptions): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (name: string, status: CheckStatus, message: string) => checks.push({ name, status, message });

  const major = Number(e.nodeVersion.split('.')[0]);
  add('Node.js', major >= MIN_NODE_MAJOR ? 'ok' : 'fail', `v${e.nodeVersion}${major >= MIN_NODE_MAJOR ? '' : ` (requires >= ${MIN_NODE_MAJOR})`}`);
  add('Platform', 'ok', `${e.platform}`);

  let config: Config = {};
  try {
    const loaded = loadConfig(options.configPath);
    config = loaded.config;
    add(
      'Configuration',
      'ok',
      loaded.exists ? `${options.configPath}` : `${options.configPath} (not created yet, using defaults: all modules)`,
    );
  } catch (error) {
    add('Configuration', 'fail', error instanceof ConfigError ? error.message : String(error));
  }

  const built = await buildRegistry(config, { configPath: options.configPath, cwd: e.cwd });
  const enabledModules = built.registry.listModules().filter((m) => m.enabled);
  add('Built-in modules', 'ok', BUILTIN_MODULE_IDS.join(', '));
  add(
    'Enabled modules',
    enabledModules.length ? 'ok' : 'warn',
    enabledModules.length ? enabledModules.map((m) => `${m.id}@${m.version} (${m.toolCount})`).join(', ') : 'no modules enabled: run `deterministic-tools enable <module>`',
  );
  if (config.plugins?.length) {
    add('Plugins', built.errors.length ? 'fail' : 'ok', built.errors.length ? built.errors.join('; ') : built.plugins.map((p) => p.specifier).join(', '));
  }
  for (const w of built.warnings) add('Configuration', 'warn', w);

  for (const integration of INTEGRATIONS) {
    const scopes = integration === 'cursor' ? (['global', 'project'] as const) : (['global'] as const);
    for (const scope of scopes) {
      const s = integrationStatus(e, integration, scope);
      if (s.error) add(`MCP config: ${s.target.label}`, 'fail', s.error);
      else if (s.configured) add(`MCP config: ${s.target.label}`, 'ok', s.target.path);
      else if (s.target.detected || integration !== 'claude-code') {
        add(`MCP config: ${s.target.label}`, 'warn', `not configured (${s.target.path}) - run \`deterministic-tools install ${integration}${scope === 'project' ? ' --scope project' : ''}\``);
      }
    }
  }

  const timeout = options.timeoutMs ?? 15_000;
  const expected = built.registry.list().length;
  try {
    const conn = await withTimeout(connectInMemory(built.registry), timeout, 'in-memory MCP connection');
    try {
      const { tools } = await conn.client.listTools();
      add('MCP server (in-memory)', tools.length === expected ? 'ok' : 'fail', `tools/list returned ${tools.length} of ${expected} enabled tools`);
      let called = 0;
      const failures: string[] = [];
      for (const m of enabledModules) {
        const sample = built.registry.list({ moduleId: m.id }).find((t) => t.tool.examples[0]);
        if (!sample) continue;
        const res = await conn.client.callTool({ name: sample.name, arguments: sample.tool.examples[0]!.input as Record<string, unknown> });
        if (res.isError) failures.push(sample.name);
        else called++;
      }
      add('Tool calls', failures.length ? 'fail' : 'ok', failures.length ? `failed: ${failures.join(', ')}` : `${called} sample tools/call succeeded`);
    } finally {
      await conn.close();
    }
  } catch (error) {
    add('MCP server (in-memory)', 'fail', error instanceof Error ? error.message : String(error));
  }

  if (options.stdioCommand) {
    const client = new Client({ name: 'deterministic-tools-doctor', version: '1.0.0' });
    const transport = new StdioClientTransport({
      command: options.stdioCommand.command,
      args: options.stdioCommand.args,
      stderr: 'ignore',
      env: Object.fromEntries(Object.entries(e.env).filter((kv): kv is [string, string] => kv[1] !== undefined)),
    });
    try {
      await withTimeout(client.connect(transport as Transport), timeout, 'stdio server start');
      const { tools } = await withTimeout(client.listTools(), timeout, 'tools/list over stdio');
      add('MCP server (stdio launch)', tools.length === expected ? 'ok' : 'fail', `started \`${[options.stdioCommand.command, ...options.stdioCommand.args].join(' ')}\`, ${tools.length} tools`);
    } catch (error) {
      add('MCP server (stdio launch)', 'fail', error instanceof Error ? error.message : String(error));
    } finally {
      await client.close().catch(() => undefined);
    }
  }
  return checks;
}

export function doctorExitCode(checks: readonly Check[]): number {
  return checks.some((c) => c.status === 'fail') ? 1 : 0;
}
