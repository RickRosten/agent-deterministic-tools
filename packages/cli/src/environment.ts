import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Everything the CLI reads from the host, injectable for tests. Tools never see any of this:
 * it only affects where configuration files live.
 */
export interface CliEnvironment {
  platform: NodeJS.Platform;
  homedir: string;
  cwd: string;
  env: Record<string, string | undefined>;
  stdout: { write(chunk: string): unknown; isTTY?: boolean };
  stderr: { write(chunk: string): unknown; isTTY?: boolean };
  stdinIsTTY: boolean;
  nodeVersion: string;
  /** Absolute path of the running CLI entry (for doctor's stdio launch check). */
  binPath: string | undefined;
}

export function processEnvironment(): CliEnvironment {
  return {
    platform: process.platform,
    homedir: homedir(),
    cwd: process.cwd(),
    env: process.env,
    stdout: process.stdout,
    stderr: process.stderr,
    stdinIsTTY: Boolean(process.stdin.isTTY),
    nodeVersion: process.versions.node,
    binPath: process.argv[1],
  };
}

/** Per-user configuration directory following each OS's convention. */
export function configDir(e: CliEnvironment): string {
  if (e.platform === 'win32') return join(e.env['APPDATA'] ?? join(e.homedir, 'AppData', 'Roaming'), 'deterministic-tools');
  if (e.platform === 'darwin') return join(e.homedir, 'Library', 'Application Support', 'deterministic-tools');
  return join(e.env['XDG_CONFIG_HOME'] || join(e.homedir, '.config'), 'deterministic-tools');
}

export function defaultConfigPath(e: CliEnvironment): string {
  return e.env['DETERMINISTIC_TOOLS_CONFIG'] || join(configDir(e), 'config.json');
}

export function claudeDesktopConfigPath(e: CliEnvironment): string {
  if (e.platform === 'win32') return join(e.env['APPDATA'] ?? join(e.homedir, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
  if (e.platform === 'darwin') return join(e.homedir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  return join(e.env['XDG_CONFIG_HOME'] || join(e.homedir, '.config'), 'Claude', 'claude_desktop_config.json');
}

export function cursorConfigPath(e: CliEnvironment, scope: 'global' | 'project'): string {
  return scope === 'global' ? join(e.homedir, '.cursor', 'mcp.json') : join(e.cwd, '.cursor', 'mcp.json');
}

export function claudeCodeProjectConfigPath(e: CliEnvironment): string {
  return join(e.cwd, '.mcp.json');
}
