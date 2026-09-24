import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { claudeDesktopConfigPath, defaultConfigPath, run, runSetup, type SetupPrompts } from '@rickrosten/agent-deterministic-tools';
import { testEnv, type TestEnv } from './helpers.js';

const here = dirname(fileURLToPath(import.meta.url));
const plainPlugin = resolve(here, 'fixtures/plain-plugin.mjs');

let env: TestEnv;
afterEach(() => env?.cleanup());

const cli = async (args: string[], e: TestEnv = env) => {
  const before = e.output().length;
  const code = await run(args, { env: e, keepAlive: false });
  return { code, out: e.output().slice(before) };
};
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

describe('paths', () => {
  it('uses OS-specific config locations', () => {
    env = testEnv();
    expect(defaultConfigPath(env)).toBe(join(env.homedir, '.config', 'deterministic-tools', 'config.json'));
    expect(defaultConfigPath({ ...env, env: { XDG_CONFIG_HOME: '/x' } })).toBe(join('/x', 'deterministic-tools', 'config.json'));
    expect(defaultConfigPath({ ...env, platform: 'darwin' })).toBe(join(env.homedir, 'Library', 'Application Support', 'deterministic-tools', 'config.json'));
    expect(defaultConfigPath({ ...env, platform: 'win32', env: { APPDATA: 'C:\\Users\\a\\AppData\\Roaming' } })).toContain('deterministic-tools');
    expect(claudeDesktopConfigPath({ ...env, platform: 'darwin' })).toBe(join(env.homedir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'));
  });
});

describe('list / modules', () => {
  it('lists all 43 built-in tools as JSON', async () => {
    env = testEnv();
    const { code, out } = await cli(['list', '--json']);
    expect(code).toBe(0);
    const tools = JSON.parse(out) as Array<{ name: string }>;
    expect(tools).toHaveLength(43);
    expect(tools.map((t) => t.name)).toContain('units.convert');
  });

  it('renders markdown documentation metadata', async () => {
    env = testEnv();
    const { out } = await cli(['list', '--all', '--format', 'markdown', '--module', 'math']);
    expect(out).toContain('### `math.percentage_change`');
    expect(out).toContain('| `oldValue` | yes |');
  });

  it('shows modules with status', async () => {
    env = testEnv();
    const { out } = await cli(['modules', '--json']);
    expect(JSON.parse(out).map((m: { id: string; enabled: boolean }) => [m.id, m.enabled])).toEqual([
      ['math', true],
      ['finance', true],
      ['statistics', true],
      ['datetime', true],
      ['units', true],
    ]);
  });
});

describe('enable / disable / config', () => {
  it('disable writes the config and hides tools', async () => {
    env = testEnv();
    expect((await cli(['disable', 'finance', 'statistics'])).code).toBe(0);
    const config = readJson(defaultConfigPath(env));
    expect(config.modules).toEqual(['math', 'datetime', 'units']);
    const tools = JSON.parse((await cli(['list', '--json'])).out) as Array<{ name: string }>;
    expect(tools.some((t) => t.name.startsWith('finance.'))).toBe(false);
    expect((await cli(['enable', 'finance'])).code).toBe(0);
    expect(readJson(defaultConfigPath(env)).modules).toEqual(['math', 'finance', 'datetime', 'units']);
  });

  it('rejects unknown modules', async () => {
    env = testEnv();
    expect((await cli(['enable', 'chemistry'])).code).toBe(1);
    expect(env.errors()).toContain('Unknown module(s): chemistry');
  });

  it('config path / init / show / validate', async () => {
    env = testEnv();
    const custom = join(env.root, 'custom.json');
    expect((await cli(['--config', custom, 'config', 'path'])).out.trim()).toBe(custom);
    expect((await cli(['--config', custom, 'config', 'init'])).code).toBe(0);
    expect(readJson(custom)).toMatchObject({ modules: ['math', 'finance', 'statistics', 'datetime', 'units'] });
    expect((await cli(['--config', custom, 'config', 'init'])).code).toBe(1);
    expect((await cli(['--config', custom, 'config', 'validate'])).code).toBe(0);
    expect((await cli(['--config', custom, 'config'])).out).toContain('"modules"');
  });

  it('reports invalid configuration clearly', async () => {
    env = testEnv();
    const path = defaultConfigPath(env);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, '{"modules": "math"}');
    expect((await cli(['list'])).code).toBe(1);
    expect(env.errors()).toContain('Invalid configuration');
    writeFileSync(path, '{not json');
    expect((await cli(['list'])).code).toBe(1);
    expect(env.errors()).toContain('not valid JSON');
  });

  it('warns about unknown modules and tools in the config', async () => {
    env = testEnv();
    const path = defaultConfigPath(env);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ modules: ['math', 'nope'], disabledTools: ['math.power', 'math.nope'] }));
    const tools = JSON.parse((await cli(['list', '--json'])).out) as Array<{ name: string }>;
    expect(tools).toHaveLength(12);
    expect(env.errors()).toContain('Unknown module "nope"');
    expect(env.errors()).toContain('Unknown tool "math.nope"');
  });
});

describe('call / schema', () => {
  it('executes tools', async () => {
    env = testEnv();
    const ok = await cli(['call', 'math.sum', '{"values":[0.1,0.2]}']);
    expect(ok.code).toBe(0);
    expect(JSON.parse(ok.out)).toEqual({ result: 0.3, count: 2 });
    const bad = await cli(['call', 'math.sum', '{"values":[]}']);
    expect(bad.code).toBe(1);
    expect(JSON.parse(bad.out)).toMatchObject({ error: { code: 'INVALID_INPUT' } });
    expect((await cli(['call', 'math.sum', 'nope'])).code).toBe(2);
  });

  it('logs execution records in debug mode without inputs', async () => {
    env = testEnv();
    await cli(['--debug', 'call', 'math.sum', '{"values":[1]}']);
    expect(env.errors()).toMatch(/exec math\.sum ok .*fields=values/);
    expect(env.errors()).not.toContain('"values":[1]');
    await cli(['--debug', '--log-inputs', 'call', 'math.sum', '{"values":[1]}']);
    expect(env.errors()).toContain('input={"values":[1]}');
  });

  it('prints definitions for other interfaces', async () => {
    env = testEnv();
    const responses = JSON.parse((await cli(['schema', '--format', 'openai-responses'])).out);
    expect(responses[0]).toMatchObject({ type: 'function', name: 'math__percentage' });
    const mcp = JSON.parse((await cli(['schema'])).out);
    expect(mcp.tools).toHaveLength(43);
  });
});

describe('integrations', () => {
  it('installs into Claude Desktop, preserving other servers, idempotently', async () => {
    env = testEnv();
    const path = claudeDesktopConfigPath(env);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ mcpServers: { other: { command: 'x' } }, theme: 'dark' }));
    expect((await cli(['install', 'claude'])).code).toBe(0);
    const config = readJson(path);
    expect(config).toEqual({
      mcpServers: { other: { command: 'x' }, 'deterministic-tools': { command: 'npx', args: ['-y', '@rickrosten/agent-deterministic-tools', 'serve'] } },
      theme: 'dark',
    });
    expect(existsSync(`${path}.bak`)).toBe(true);
    expect((await cli(['install', 'claude'])).out).toContain('already configured');
    expect((await cli(['uninstall', 'claude'])).out).toContain('removed');
    expect(readJson(path).mcpServers).toEqual({ other: { command: 'x' } });
  });

  it('uses cmd /c npx on Windows and passes custom config paths', async () => {
    env = testEnv({ platform: 'win32' });
    env.env['APPDATA'] = join(env.root, 'AppData');
    const custom = join(env.root, 'my.json');
    await cli(['--config', custom, 'install', 'claude']);
    expect(readJson(join(env.root, 'AppData', 'Claude', 'claude_desktop_config.json')).mcpServers['deterministic-tools']).toEqual({
      command: 'cmd',
      args: ['/c', 'npx', '-y', '@rickrosten/agent-deterministic-tools', 'serve', '--config', custom],
    });
  });

  it('installs Cursor globally or per project and Claude Code per project', async () => {
    env = testEnv();
    await cli(['install', 'cursor']);
    expect(readJson(join(env.homedir, '.cursor', 'mcp.json')).mcpServers).toHaveProperty('deterministic-tools');
    await cli(['install', 'cursor', '--scope', 'project']);
    expect(readJson(join(env.cwd, '.cursor', 'mcp.json')).mcpServers).toHaveProperty('deterministic-tools');
    await cli(['install', 'claude-code']);
    expect(readJson(join(env.cwd, '.mcp.json')).mcpServers['deterministic-tools']).toMatchObject({ type: 'stdio', command: 'npx' });
  });

  it('prints snippets and deeplinks without writing', async () => {
    env = testEnv();
    const { out } = await cli(['install', 'cursor', '--print']);
    expect(out).toContain('"mcpServers"');
    expect(out).toContain('cursor://anysphere.cursor-deeplink/mcp/install?name=deterministic-tools');
    expect(existsSync(join(env.homedir, '.cursor', 'mcp.json'))).toBe(false);
  });
});

describe('plugins', () => {
  it('loads only explicitly allowed plugins', async () => {
    env = testEnv();
    expect((await cli(['plugin', 'add', plainPlugin])).code).toBe(0);
    expect(readJson(defaultConfigPath(env)).plugins).toEqual([plainPlugin]);
    const res = await cli(['call', 'plain.double', '{"value":21}']);
    expect(JSON.parse(res.out)).toEqual({ result: 42 });
    const modules = JSON.parse((await cli(['modules', '--json'])).out);
    expect(modules.find((m: { id: string }) => m.id === 'plain')).toMatchObject({ enabled: true, source: plainPlugin });
    expect((await cli(['plugin', 'remove', plainPlugin])).code).toBe(0);
    expect((await cli(['call', 'plain.double', '{"value":21}'])).code).toBe(1);
  });

  it('reports missing plugins', async () => {
    env = testEnv();
    const path = defaultConfigPath(env);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ plugins: ['@acme/not-installed'] }));
    const { code } = await cli(['list', '--json']);
    expect(code).toBe(0);
    expect(env.errors()).toContain('Plugin "@acme/not-installed" is not installed');
  });
});

describe('doctor', () => {
  it('passes on a clean environment', async () => {
    env = testEnv();
    const { code, out } = await cli(['doctor', '--json', '--no-spawn']);
    const checks = JSON.parse(out) as Array<{ name: string; status: string; message: string }>;
    expect(code).toBe(0);
    expect(checks.find((c) => c.name === 'Node.js')).toMatchObject({ status: 'ok' });
    expect(checks.find((c) => c.name === 'MCP server (in-memory)')).toMatchObject({ status: 'ok', message: 'tools/list returned 43 of 43 enabled tools' });
    expect(checks.find((c) => c.name === 'Tool calls')).toMatchObject({ status: 'ok', message: '5 sample tools/call succeeded' });
    expect(checks.find((c) => c.name.startsWith('MCP config: Claude Desktop'))).toMatchObject({ status: 'warn' });
  });

  it('fails on old Node.js and broken config', async () => {
    env = testEnv({ nodeVersion: '18.20.0' });
    const path = defaultConfigPath(env);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, '{');
    const { code, out } = await cli(['doctor', '--json', '--no-spawn']);
    expect(code).toBe(1);
    const checks = JSON.parse(out) as Array<{ name: string; status: string }>;
    expect(checks.find((c) => c.name === 'Node.js')!.status).toBe('fail');
    expect(checks.find((c) => c.name === 'Configuration')!.status).toBe('fail');
  });
});

describe('setup wizard', () => {
  it('writes config, installs selected integrations and verifies', async () => {
    env = testEnv();
    const messages: string[] = [];
    const answers = [['math', 'units'], ['cursor']];
    const prompts: SetupPrompts = {
      intro: (m) => messages.push(m),
      outro: (m) => messages.push(m),
      note: (m) => messages.push(m),
      info: (m) => messages.push(m),
      warn: (m) => messages.push(`WARN ${m}`),
      success: (m) => messages.push(m),
      multiselect: async () => answers.shift() as never,
      confirm: async () => true,
    };
    const result = await runSetup(env, defaultConfigPath(env), prompts);
    expect(result).toMatchObject({ cancelled: false, installed: ['cursor'], config: { modules: ['math', 'units'] } });
    expect(readJson(defaultConfigPath(env)).modules).toEqual(['math', 'units']);
    expect(readJson(join(env.homedir, '.cursor', 'mcp.json')).mcpServers).toHaveProperty('deterministic-tools');
    expect(messages.join('\n')).toContain('tools/list returned 15 of 15 enabled tools');
    expect(messages.some((m) => m.startsWith('WARN'))).toBe(false);
  });

  it('cancelling changes nothing', async () => {
    env = testEnv();
    const prompts = {
      intro() {}, outro() {}, note() {}, info() {}, warn() {}, success() {},
      multiselect: async () => undefined,
      confirm: async () => undefined,
    } as SetupPrompts;
    expect((await runSetup(env, defaultConfigPath(env), prompts)).cancelled).toBe(true);
    expect(existsSync(defaultConfigPath(env))).toBe(false);
  });
});

describe('help and version', () => {
  it('prints version and help', async () => {
    env = testEnv();
    expect((await cli(['--version'])).out.trim()).toBe('1.0.0');
    const help = await cli(['--help']);
    expect(help.code).toBe(0);
    for (const cmd of ['list', 'modules', 'enable', 'disable', 'doctor', 'serve', 'config', 'install']) expect(help.out).toContain(cmd);
    expect((await cli(['frobnicate'])).code).toBe(2);
  });
});
