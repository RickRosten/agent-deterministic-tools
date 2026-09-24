import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  claudeCodeProjectConfigPath,
  claudeDesktopConfigPath,
  cursorConfigPath,
  defaultConfigPath,
  type CliEnvironment,
} from './environment.js';
import { readJsonObject, writeJsonFile } from './fsutil.js';

export const SERVER_KEY = 'deterministic-tools';
export const INTEGRATIONS = ['claude', 'cursor', 'claude-code'] as const;
export type Integration = (typeof INTEGRATIONS)[number];

export interface ServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/**
 * Command an MCP client should run. Uses `npx` so no global install is needed; on Windows
 * `npx` is a .cmd shim and must be started through `cmd /c`.
 */
export function serverEntry(e: CliEnvironment, configPath: string): ServerEntry {
  const args = ['-y', '@rickrosten/agent-deterministic-tools', 'serve'];
  if (configPath !== defaultConfigPath(e)) args.push('--config', configPath);
  return e.platform === 'win32' ? { command: 'cmd', args: ['/c', 'npx', ...args] } : { command: 'npx', args };
}

export interface IntegrationTarget {
  integration: Integration;
  label: string;
  path: string;
  /** Heuristic: the client appears to be installed on this machine. */
  detected: boolean;
}

export function integrationTarget(e: CliEnvironment, integration: Integration, scope: 'global' | 'project' = 'global'): IntegrationTarget {
  switch (integration) {
    case 'claude': {
      const path = claudeDesktopConfigPath(e);
      return { integration, label: 'Claude Desktop', path, detected: existsSync(dirname(path)) };
    }
    case 'cursor': {
      const path = cursorConfigPath(e, scope);
      const detected = existsSync(dirname(cursorConfigPath(e, 'global')));
      return { integration, label: scope === 'global' ? 'Cursor (global)' : 'Cursor (this project)', path, detected };
    }
    case 'claude-code': {
      const path = claudeCodeProjectConfigPath(e);
      const pathDirs = (e.env['PATH'] ?? '').split(e.platform === 'win32' ? ';' : ':');
      const bin = e.platform === 'win32' ? ['claude.exe', 'claude.cmd'] : ['claude'];
      const detected = pathDirs.some((d) => d && bin.some((b) => existsSync(join(d, b))));
      return { integration, label: 'Claude Code (this project)', path, detected };
    }
  }
}

export interface InstallResult {
  target: IntegrationTarget;
  entry: ServerEntry;
  changed: boolean;
  backupPath?: string;
}

function sameEntry(a: unknown, b: ServerEntry): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Adds (or updates) the server in the client's `mcpServers` map, preserving everything else. */
export function installIntegration(e: CliEnvironment, integration: Integration, options: { scope?: 'global' | 'project'; configPath: string }): InstallResult {
  const target = integrationTarget(e, integration, options.scope);
  const entry = serverEntry(e, options.configPath);
  const current = readJsonObject(target.path) ?? {};
  const servers = (current['mcpServers'] && typeof current['mcpServers'] === 'object' ? current['mcpServers'] : {}) as Record<string, unknown>;
  const value = integration === 'claude-code' ? { type: 'stdio', ...entry } : entry;
  if (sameEntry(servers[SERVER_KEY], value as ServerEntry)) return { target, entry, changed: false };
  const next = { ...current, mcpServers: { ...servers, [SERVER_KEY]: value } };
  const { backupPath } = writeJsonFile(target.path, next, { backup: true });
  return backupPath ? { target, entry, changed: true, backupPath } : { target, entry, changed: true };
}

export function uninstallIntegration(e: CliEnvironment, integration: Integration, scope: 'global' | 'project' = 'global'): { target: IntegrationTarget; changed: boolean } {
  const target = integrationTarget(e, integration, scope);
  const current = readJsonObject(target.path);
  const servers = current?.['mcpServers'] as Record<string, unknown> | undefined;
  if (!current || !servers || !(SERVER_KEY in servers)) return { target, changed: false };
  const { [SERVER_KEY]: _removed, ...rest } = servers;
  writeJsonFile(target.path, { ...current, mcpServers: rest }, { backup: true });
  return { target, changed: true };
}

export interface IntegrationStatus {
  target: IntegrationTarget;
  configured: boolean;
  error?: string;
}

export function integrationStatus(e: CliEnvironment, integration: Integration, scope: 'global' | 'project' = 'global'): IntegrationStatus {
  const target = integrationTarget(e, integration, scope);
  try {
    const current = readJsonObject(target.path);
    const servers = current?.['mcpServers'] as Record<string, unknown> | undefined;
    return { target, configured: Boolean(servers && SERVER_KEY in servers) };
  } catch (error) {
    return { target, configured: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** JSON snippet for manual setup. */
export function configSnippet(entry: ServerEntry): string {
  return JSON.stringify({ mcpServers: { [SERVER_KEY]: entry } }, null, 2);
}

/** Cursor one-click install deeplink. */
export function cursorDeeplink(entry: ServerEntry): string {
  const config = Buffer.from(JSON.stringify(entry)).toString('base64');
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${SERVER_KEY}&config=${encodeURIComponent(config)}`;
}

export function claudeCodeCommand(entry: ServerEntry): string {
  return `claude mcp add --scope user ${SERVER_KEY} -- ${[entry.command, ...entry.args].join(' ')}`;
}
