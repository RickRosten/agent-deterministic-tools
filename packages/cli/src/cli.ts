import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { formatToolDescription, type ExecutionRecord } from '@rickrosten/agent-deterministic-tools-core';
import { createStreamableHttpServer, serveStdio, toMcpTool, type Logger } from '@rickrosten/agent-deterministic-tools-mcp';
import { toChatCompletionsTools, toResponsesTools } from '@rickrosten/agent-deterministic-tools-openai';
import { Argument, Command, CommanderError, Option } from 'commander';
import { ConfigError, defaultConfig, loadConfig, saveConfig, type Config } from './config.js';
import { doctorExitCode, runDoctor } from './doctor.js';
import { defaultConfigPath, processEnvironment, type CliEnvironment } from './environment.js';
import {
  claudeCodeCommand,
  configSnippet,
  cursorDeeplink,
  installIntegration,
  INTEGRATIONS,
  serverEntry,
  uninstallIntegration,
  type Integration,
} from './integrations.js';
import { createPrinter, table, type Printer } from './output.js';
import { loadPlugin } from './plugins.js';
import { buildRegistry, type BuiltRegistry } from './registry.js';
import { runSetup, type SetupPrompts } from './setup.js';
import { VERSION } from './version.js';

interface GlobalOptions {
  config?: string;
  debug?: boolean;
  logInputs?: boolean;
}

export interface RunOptions {
  env?: CliEnvironment;
  prompts?: SetupPrompts;
  /** Keep long-running servers alive (default true). Tests pass false. */
  keepAlive?: boolean;
}

class ExitError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

function makeLogger(p: Printer, debug: boolean): Logger {
  return (level, message, data) => {
    if (level === 'debug' && !debug) return;
    const suffix = data && Object.keys(data).length ? ` ${JSON.stringify(data)}` : '';
    p.err(`[deterministic-tools] ${level}: ${message}${suffix}`);
  };
}

function executionLogger(p: Printer): (r: ExecutionRecord) => void {
  return (r) => {
    const status = r.status === 'success' ? 'ok' : `error ${r.errorCode ?? ''}`.trim();
    const input = r.input === undefined ? `fields=${r.inputFields.join(',') || '-'}` : `input=${JSON.stringify(r.input)}`;
    p.err(`[deterministic-tools] debug: exec ${r.tool} ${status} ${r.durationMs}ms validation=${r.inputValidation}/${r.outputValidation} ${input}`);
  };
}

/**
 * Runs the CLI. Returns the exit code, or `undefined` when a server was started and the
 * process must stay alive.
 */
export async function run(argv: readonly string[], options: RunOptions = {}): Promise<number | undefined> {
  const e = options.env ?? processEnvironment();
  const p = createPrinter(e);
  let result: number | undefined = 0;

  const program = new Command()
    .name('deterministic-tools')
    .description('Deterministic calculation tools for AI agents (MCP server + CLI).')
    .version(VERSION, '-v, --version')
    .option('-c, --config <path>', 'configuration file', undefined)
    .option('--debug', 'verbose logs on stderr (tool executions, config resolution)')
    .option('--log-inputs', 'include tool input values in debug logs (may contain sensitive data)')
    .showHelpAfterError()
    .exitOverride()
    .configureOutput({ writeOut: (s) => void e.stdout.write(s), writeErr: (s) => void e.stderr.write(s) });

  const globals = (): GlobalOptions => program.opts<GlobalOptions>();
  const configPath = () => globals().config ?? defaultConfigPath(e);
  const readConfig = (): { config: Config; exists: boolean } => {
    try {
      const loaded = loadConfig(configPath());
      return { config: loaded.config, exists: loaded.exists };
    } catch (error) {
      throw new ExitError(1, error instanceof ConfigError ? error.message : String(error));
    }
  };
  const registryFor = async (config: Config): Promise<BuiltRegistry> => {
    const g = globals();
    const effective = g.logInputs ? { ...config, logInputs: true } : config;
    const built = await buildRegistry(effective, {
      configPath: configPath(),
      cwd: e.cwd,
      ...(g.debug ? { observer: executionLogger(p) } : {}),
    });
    for (const w of built.warnings) p.err(p.color.yellow(`warning: ${w}`));
    for (const err of built.errors) p.err(p.color.red(`error: ${err}`));
    if (g.debug) p.err(`[deterministic-tools] debug: config=${configPath()} enabled=${built.registry.listModules().filter((m) => m.enabled).map((m) => m.id).join(',')}`);
    return built;
  };
  const allModuleIds = async (config: Config) => (await buildRegistry({ ...config, modules: [] }, { configPath: configPath(), cwd: e.cwd })).sources.map((s) => s.id);

  const serve = async (opts: {
    http?: boolean;
    host?: string;
    port?: string;
    path?: string;
    authToken?: string;
    publicUrl?: string;
    allowedOrigin?: string[];
    allowedHost?: string[];
  }) => {
    const { config } = readConfig();
    const { registry } = await registryFor(config);
    const logger = makeLogger(p, Boolean(globals().debug));
    if (!opts.http) {
      await serveStdio(registry, { version: VERSION, logger });
      result = undefined;
      return;
    }
    const http = config.http ?? {};
    const token = opts.authToken ?? e.env['DETERMINISTIC_TOOLS_AUTH_TOKEN'];
    const port = opts.port !== undefined ? Number(opts.port) : (http.port ?? 3333);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new ExitError(2, `invalid --port ${opts.port}`);
    const server = createStreamableHttpServer(registry, {
      version: VERSION,
      logger,
      host: opts.host ?? http.host ?? '127.0.0.1',
      port,
      path: opts.path ?? http.path ?? '/mcp',
      ...((opts.publicUrl ?? http.publicUrl) ? { publicUrl: (opts.publicUrl ?? http.publicUrl)! } : {}),
      allowedOrigins: [...(http.allowedOrigins ?? []), ...(opts.allowedOrigin ?? [])],
      allowedHosts: [...(http.allowedHosts ?? []), ...(opts.allowedHost ?? [])],
      ...(token || http.authorizationServers
        ? {
            auth: {
              ...(token ? { bearerToken: token } : {}),
              ...(http.authorizationServers ? { resourceMetadata: { authorizationServers: http.authorizationServers } } : {}),
            },
          }
        : {}),
    });
    const running = await server.listen();
    p.err(`MCP Streamable HTTP endpoint: ${running.url}${token ? ' (bearer token required)' : ''}`);
    if (options.keepAlive === false) {
      await running.close();
      return;
    }
    const stop = () => void running.close().finally(() => process.exit(0));
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    result = undefined;
  };

  program
    .command('serve')
    .description('start the MCP server (stdio by default)')
    .option('--http', 'serve Streamable HTTP instead of stdio')
    .option('--host <host>', 'HTTP bind address (default 127.0.0.1)')
    .option('--port <port>', 'HTTP port (default 3333)')
    .option('--path <path>', 'HTTP endpoint path (default /mcp)')
    .option('--auth-token <token>', 'require this bearer token (or set DETERMINISTIC_TOOLS_AUTH_TOKEN)')
    .option('--public-url <url>', 'public base URL for auth metadata')
    .option('--allowed-origin <origin...>', 'additional allowed Origin header values')
    .option('--allowed-host <host...>', 'additional allowed Host header values')
    .action(serve);

  program
    .command('setup')
    .description('interactive setup: choose modules and connect Claude, Cursor, ...')
    .action(async () => {
      const r = await runSetup(e, configPath(), options.prompts);
      result = r.cancelled ? 1 : 0;
    });

  program
    .command('list')
    .description('list available tools')
    .option('-a, --all', 'include tools of disabled modules')
    .option('-m, --module <id>', 'only tools of this module')
    .addOption(new Option('-f, --format <format>', 'output format').choices(['table', 'json', 'markdown']).default('table'))
    .option('--json', 'shortcut for --format json')
    .action(async (opts: { all?: boolean; module?: string; format: string; json?: boolean }) => {
      const { registry } = await registryFor(readConfig().config);
      const descriptors = registry.describeAll({ includeDisabled: Boolean(opts.all), ...(opts.module ? { moduleId: opts.module } : {}) });
      const format = opts.json ? 'json' : opts.format;
      if (format === 'json') return p.json(descriptors);
      if (format === 'markdown') {
        p.out('# Tools');
        p.out();
        p.out('Generated by `deterministic-tools list --all --format markdown`.');
        let module = '';
        for (const d of descriptors) {
          if (d.moduleId !== module) {
            module = d.moduleId;
            p.out();
            p.out(`## ${module} (v${d.moduleVersion})`);
          }
          p.out();
          p.out(`### \`${d.name}\``);
          p.out();
          p.out(d.description);
          if (d.whenToUse.length) p.out(`\n- **Use when:** ${d.whenToUse.join('; ')}`);
          if (d.whenNotToUse.length) p.out(`- **Do not use when:** ${d.whenNotToUse.join('; ')}`);
          if (d.limitations.length) p.out(`- **Limitations:** ${d.limitations.join('; ')}`);
          const props = (d.inputSchema['properties'] ?? {}) as Record<string, { description?: string }>;
          const required = new Set((d.inputSchema['required'] as string[] | undefined) ?? []);
          p.out('\n| Parameter | Required | Description |\n| --- | --- | --- |');
          for (const [name, schema] of Object.entries(props)) {
            p.out(`| \`${name}\` | ${required.has(name) ? 'yes' : 'no'} | ${(schema.description ?? '').replace(/\|/g, '\\|')} |`);
          }
          const ex = d.examples[0];
          if (ex) p.out(`\nExample input: \`${JSON.stringify(ex.input)}\``);
        }
        return;
      }
      for (const line of table(descriptors.map((d) => [d.name, registry.isEnabled(d.name) ? '' : p.color.dim('(disabled)'), d.description.split('. ')[0]!.replace(/\.$/, '')]))) p.out(line);
      p.out(p.color.dim(`\n${descriptors.length} tools`));
    });

  program
    .command('modules')
    .description('list modules and whether they are enabled')
    .option('--json', 'JSON output')
    .action(async (opts: { json?: boolean }) => {
      const built = await registryFor(readConfig().config);
      const rows = built.registry.listModules().map((m) => ({
        ...m,
        source: built.sources.find((s) => s.id === m.id)?.plugin ?? 'builtin',
      }));
      if (opts.json) return p.json(rows.map(({ tools: _t, ...rest }) => rest));
      for (const line of table([
        ['MODULE', 'STATUS', 'VERSION', 'TOOLS', 'SOURCE'],
        ...rows.map((m) => [m.id, m.enabled ? p.color.green('enabled') : p.color.dim('disabled'), m.version, String(m.toolCount), m.source]),
      ])) p.out(line);
    });

  const toggle = (enable: boolean) => async (ids: string[]) => {
    const { config } = readConfig();
    const available = await allModuleIds(config);
    const unknown = ids.filter((id) => !available.includes(id));
    if (unknown.length) throw new ExitError(1, `Unknown module(s): ${unknown.join(', ')}. Available: ${available.join(', ')}`);
    const current = new Set(config.modules ?? available);
    for (const id of ids) {
      if (enable) current.add(id);
      else current.delete(id);
    }
    const modules = available.filter((id) => current.has(id));
    saveConfig(configPath(), { ...config, modules });
    p.out(`${enable ? 'Enabled' : 'Disabled'}: ${ids.join(', ')}. Active modules: ${modules.join(', ') || '(none)'}`);
    p.out(p.color.dim(`Saved ${configPath()}. Restart your MCP client to reload tools.`));
  };
  program.command('enable').description('enable one or more modules').argument('<modules...>').action(toggle(true));
  program.command('disable').description('disable one or more modules').argument('<modules...>').action(toggle(false));

  program
    .command('config')
    .description('show or manage the configuration file')
    .addArgument(new Argument('[action]', 'show | path | init | validate').choices(['show', 'path', 'init', 'validate']).default('show'))
    .option('--force', 'overwrite an existing file (init)')
    .action(async (action: string, opts: { force?: boolean }) => {
      const path = configPath();
      if (action === 'path') return p.out(path);
      if (action === 'init') {
        const { exists } = readConfig();
        if (exists && !opts.force) throw new ExitError(1, `${path} already exists (use --force to overwrite)`);
        saveConfig(path, defaultConfig(await allModuleIds({})));
        return p.out(`Created ${path}`);
      }
      const { config, exists } = readConfig();
      if (action === 'validate') {
        const built = await registryFor(config);
        if (built.errors.length) throw new ExitError(1, 'configuration has errors');
        return p.out(p.color.green(`${exists ? path : 'default configuration'} is valid`));
      }
      p.out(p.color.dim(`# ${path}${exists ? '' : ' (not created yet; showing defaults)'}`));
      p.json({ modules: config.modules ?? (await allModuleIds(config)), plugins: config.plugins ?? [], ...config });
    });

  program
    .command('doctor')
    .description('check Node.js, configuration, modules, client configs and the MCP server')
    .option('--json', 'JSON output')
    .option('--no-spawn', 'skip launching the stdio server as a child process')
    .action(async (opts: { json?: boolean; spawn: boolean }) => {
      const bin = e.binPath;
      const stdioCommand =
        opts.spawn && bin && /\.(c|m)?js$/.test(bin)
          ? { command: process.execPath, args: [bin, 'serve', '--config', configPath()] }
          : undefined;
      const checks = await runDoctor(e, { configPath: configPath(), stdioCommand });
      result = doctorExitCode(checks);
      if (opts.json) return p.json(checks);
      for (const c of checks) {
        const label = c.status === 'ok' ? p.color.green('ok  ') : c.status === 'warn' ? p.color.yellow('warn') : p.color.red('FAIL');
        p.out(`${label}  ${p.color.bold(c.name)}: ${c.message}`);
      }
      p.out();
      p.out(result === 0 ? p.color.green('All required checks passed.') : p.color.red('Some checks failed.'));
    });

  const integrationArg = () => new Argument('<client>', INTEGRATIONS.join(' | ')).choices([...INTEGRATIONS]);
  program
    .command('install')
    .description('add the MCP server to a client configuration (claude, cursor, claude-code)')
    .addArgument(integrationArg())
    .addOption(new Option('--scope <scope>', 'cursor: global (~/.cursor) or project (./.cursor)').choices(['global', 'project']).default('global'))
    .option('--print', 'print the configuration instead of writing it')
    .action(async (client: Integration, opts: { scope: 'global' | 'project'; print?: boolean }) => {
      const entry = serverEntry(e, configPath());
      if (opts.print) {
        p.out(configSnippet(entry));
        if (client === 'cursor') p.out(`\nOne-click: ${cursorDeeplink(entry)}`);
        if (client === 'claude-code') p.out(`\nOr: ${claudeCodeCommand(entry)}`);
        return;
      }
      const r = installIntegration(e, client, { configPath: configPath(), scope: opts.scope });
      p.out(`${r.target.label}: ${r.changed ? 'configured' : 'already configured'} -> ${r.target.path}`);
      if (r.backupPath) p.out(p.color.dim(`Previous file saved as ${r.backupPath}`));
      if (client === 'claude') p.out('Restart Claude Desktop to load the tools.');
      if (client === 'cursor') p.out('Cursor picks up mcp.json automatically (Settings > MCP shows the server). Older Cursor versions: add it manually in Settings > MCP.');
      if (client === 'claude-code') p.out(`Project-scoped .mcp.json written. For all projects run: ${claudeCodeCommand(r.entry)}`);
    });

  program
    .command('uninstall')
    .description('remove the MCP server from a client configuration')
    .addArgument(integrationArg())
    .addOption(new Option('--scope <scope>').choices(['global', 'project']).default('global'))
    .action(async (client: Integration, opts: { scope: 'global' | 'project' }) => {
      const r = uninstallIntegration(e, client, opts.scope);
      p.out(`${r.target.label}: ${r.changed ? 'removed' : 'not configured'} (${r.target.path})`);
    });

  const plugin = program.command('plugin').description('manage explicitly allowed third-party modules');
  plugin
    .command('add')
    .description('install (npm) and allow a third-party module package or local path')
    .argument('<specifier>')
    .option('--no-install', 'do not run npm install (package already installed)')
    .action(async (spec: string, opts: { install: boolean }) => {
      const { config } = readConfig();
      const dir = dirname(configPath());
      const isPath = spec.startsWith('.') || spec.startsWith('/') || /^[A-Za-z]:[\\/]/.test(spec);
      if (!isPath && opts.install) {
        p.err(`Installing ${spec} into ${dir} ...`);
        const npm = e.platform === 'win32' ? 'npm.cmd' : 'npm';
        const res = spawnSync(npm, ['install', '--prefix', dir, '--no-audit', '--no-fund', spec], { stdio: 'inherit', shell: e.platform === 'win32' });
        if (res.status !== 0) throw new ExitError(1, `npm install ${spec} failed`);
      }
      const loaded = await loadPlugin(spec, { configDir: dir, cwd: e.cwd }).catch((error: unknown) => {
        throw new ExitError(1, error instanceof Error ? error.message : String(error));
      });
      const plugins = [...new Set([...(config.plugins ?? []), spec])];
      const ids = loaded.modules.map((m) => m.id);
      const modules = config.modules ? [...new Set([...config.modules, ...ids])] : undefined;
      saveConfig(configPath(), { ...config, plugins, ...(modules ? { modules } : {}) });
      p.out(`Allowed plugin ${spec}: modules ${ids.join(', ')}`);
    });
  plugin
    .command('remove')
    .description('stop loading a third-party module')
    .argument('<specifier>')
    .action(async (spec: string) => {
      const { config } = readConfig();
      if (!config.plugins?.includes(spec)) throw new ExitError(1, `${spec} is not in plugins`);
      saveConfig(configPath(), { ...config, plugins: config.plugins.filter((s) => s !== spec) });
      p.out(`Removed plugin ${spec}`);
    });
  plugin
    .command('list')
    .description('list allowed plugins')
    .action(async () => {
      const built = await registryFor(readConfig().config);
      if (!built.plugins.length) return p.out('No plugins configured.');
      for (const pl of built.plugins) p.out(`${pl.specifier}  ${pl.modules.map((m) => `${m.id}@${m.version}`).join(', ')}  ${p.color.dim(pl.resolvedPath)}`);
    });

  program
    .command('call')
    .description('execute a tool locally, e.g. call math.sum \'{"values":[1,2]}\'')
    .argument('<tool>', 'fully-qualified tool name')
    .argument('[input]', 'JSON input', '{}')
    .action(async (tool: string, input: string) => {
      let args: unknown;
      try {
        args = JSON.parse(input);
      } catch {
        throw new ExitError(2, 'input must be valid JSON');
      }
      const { registry } = await registryFor(readConfig().config);
      const res = await registry.execute(tool, args);
      p.json(res.ok ? res.data : { error: res.error });
      result = res.ok ? 0 : 1;
    });

  program
    .command('schema')
    .description('print tool definitions for other tool-calling interfaces')
    .addOption(new Option('--format <format>', 'definition format').choices(['mcp', 'openai-responses', 'openai-chat', 'descriptors']).default('mcp'))
    .option('--strict', 'OpenAI strict schemas')
    .action(async (opts: { format: string; strict?: boolean }) => {
      const { registry } = await registryFor(readConfig().config);
      const strict = Boolean(opts.strict);
      if (opts.format === 'openai-responses') return p.json(toResponsesTools(registry, { strict }));
      if (opts.format === 'openai-chat') return p.json(toChatCompletionsTools(registry, { strict }));
      const descriptors = registry.describeAll();
      if (opts.format === 'descriptors') return p.json(descriptors.map((d) => ({ ...d, llmDescription: formatToolDescription(d) })));
      p.json({ tools: descriptors.map(toMcpTool) });
    });

  program.action(async () => {
    // `npx @rickrosten/agent-deterministic-tools`: interactive setup in a terminal; MCP stdio server when
    // launched by a client (stdin is a pipe).
    if (e.stdinIsTTY && e.stdout.isTTY) {
      const r = await runSetup(e, configPath(), options.prompts);
      result = r.cancelled ? 1 : 0;
    } else {
      await serve({});
    }
  });

  try {
    await program.parseAsync([...argv], { from: 'user' });
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.code === 'commander.helpDisplayed' || error.code === 'commander.version' || error.code === 'commander.help' ? 0 : 2;
    }
    if (error instanceof ExitError) {
      p.err(p.color.red(`error: ${error.message}`));
      return error.code;
    }
    p.err(p.color.red(`error: ${error instanceof Error ? error.message : String(error)}`));
    if (globals().debug && error instanceof Error && error.stack) p.err(error.stack);
    return 1;
  }
  return result;
}
