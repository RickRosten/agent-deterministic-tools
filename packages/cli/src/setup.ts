import * as clack from '@clack/prompts';
import { BUILTIN_MODULES } from './builtins.js';
import { ConfigError, defaultConfig, loadConfig, saveConfig, type Config } from './config.js';
import { runDoctor } from './doctor.js';
import type { CliEnvironment } from './environment.js';
import {
  claudeCodeCommand,
  configSnippet,
  cursorDeeplink,
  installIntegration,
  integrationStatus,
  serverEntry,
  type Integration,
} from './integrations.js';

type Choice<T> = { value: T; label: string; hint?: string };

/** Prompt primitives used by the wizard; replaceable in tests. */
export interface SetupPrompts {
  intro(title: string): void;
  outro(message: string): void;
  note(message: string, title?: string): void;
  info(message: string): void;
  warn(message: string): void;
  success(message: string): void;
  multiselect<T>(message: string, options: Choice<T>[], initial: T[]): Promise<T[] | undefined>;
  confirm(message: string, initial: boolean): Promise<boolean | undefined>;
}

export const clackPrompts: SetupPrompts = {
  intro: (t) => clack.intro(t),
  outro: (m) => clack.outro(m),
  note: (m, t) => clack.note(m, t),
  info: (m) => clack.log.info(m),
  warn: (m) => clack.log.warn(m),
  success: (m) => clack.log.success(m),
  async multiselect(message, options, initial) {
    const r = await clack.multiselect({ message, options: options as never, initialValues: initial as never, required: false });
    return clack.isCancel(r) ? undefined : (r as never);
  },
  async confirm(message, initial) {
    const r = await clack.confirm({ message, initialValue: initial });
    return clack.isCancel(r) ? undefined : r;
  },
};

export interface SetupResult {
  config: Config;
  installed: Integration[];
  cancelled: boolean;
}

/**
 * Interactive one-command setup: detect environment, check configuration, choose modules,
 * write configuration, install client integrations and verify the server.
 */
export async function runSetup(e: CliEnvironment, configPath: string, prompts: SetupPrompts = clackPrompts): Promise<SetupResult> {
  prompts.intro('Deterministic Tools setup');

  // 1. Environment
  const statuses = (['claude', 'cursor', 'claude-code'] as const).map((i) => integrationStatus(e, i));
  prompts.note(
    [
      `Node.js      v${e.nodeVersion}`,
      `Platform     ${e.platform}`,
      `Config file  ${configPath}`,
      ...statuses.map((s) => `${s.target.label.padEnd(26)} ${s.configured ? 'configured' : s.target.detected ? 'detected' : 'not detected'}`),
    ].join('\n'),
    'Environment',
  );

  // 2. Existing configuration
  let current: Config = {};
  try {
    const loaded = loadConfig(configPath);
    current = loaded.config;
    prompts.info(loaded.exists ? 'Existing configuration found.' : 'No configuration yet; a new one will be created.');
  } catch (error) {
    prompts.warn(`${error instanceof ConfigError ? error.message : String(error)}\nIt will be replaced with a valid configuration.`);
  }

  // 3-4. Modules
  const enabled = current.modules ?? BUILTIN_MODULES.map((m) => m.id);
  const modules = await prompts.multiselect(
    'Which modules should your AI assistant get?',
    BUILTIN_MODULES.map((m) => ({ value: m.id, label: m.name, hint: `${m.tools.length} tools` })),
    enabled.filter((id) => BUILTIN_MODULES.some((m) => m.id === id)),
  );
  if (modules === undefined) {
    prompts.outro('Setup cancelled. Nothing was changed.');
    return { config: current, installed: [], cancelled: true };
  }
  const pluginModules = enabled.filter((id) => !BUILTIN_MODULES.some((m) => m.id === id));
  const config: Config = { ...current, ...defaultConfig([...modules, ...pluginModules]) };

  // 5. Write configuration
  saveConfig(configPath, config);
  prompts.success(`Configuration saved to ${configPath}`);

  // 6. Integrations
  const choices: Choice<Integration>[] = statuses.map((s) => ({
    value: s.target.integration,
    label: s.target.label,
    hint: s.configured ? 'already configured' : s.target.detected ? 'detected' : 'not detected',
  }));
  const initial = statuses.filter((s) => s.target.detected || s.configured).map((s) => s.target.integration);
  const selected = await prompts.multiselect('Connect to which clients?', choices, initial);
  const installed: Integration[] = [];
  for (const integration of selected ?? []) {
    try {
      const r = installIntegration(e, integration, { configPath });
      installed.push(integration);
      prompts.success(`${r.target.label}: ${r.changed ? 'configured' : 'already up to date'} (${r.target.path})`);
    } catch (error) {
      prompts.warn(`${integration}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const entry = serverEntry(e, configPath);
  prompts.note(
    [
      'Cursor one-click install:',
      cursorDeeplink(entry),
      '',
      'Claude Code (all projects):',
      claudeCodeCommand(entry),
      '',
      'Any other MCP client (stdio):',
      configSnippet(entry),
      '',
      'Remote / OpenAI MCP (Streamable HTTP):',
      'npx @rickrosten/agent-deterministic-tools serve --http --port 3333',
    ].join('\n'),
    'Other integrations',
  );

  // 7. Verify
  const checks = await runDoctor(e, { configPath });
  const failed = checks.filter((c) => c.status === 'fail');
  if (failed.length) prompts.warn(`Verification found problems:\n${failed.map((c) => `- ${c.name}: ${c.message}`).join('\n')}`);
  else prompts.success(checks.filter((c) => c.name === 'MCP server (in-memory)' || c.name === 'Tool calls').map((c) => c.message).join('; '));

  prompts.outro(installed.length ? 'Done. Restart your AI client to load the tools.' : 'Done.');
  return { config, installed, cancelled: false };
}
