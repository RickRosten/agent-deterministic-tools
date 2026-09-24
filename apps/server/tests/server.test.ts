import { describe, expect, it } from 'vitest';
import { createApp, settingsFromEnv } from '../src/app.js';

describe('server app settings', () => {
  it('defaults to loopback and all modules', () => {
    expect(settingsFromEnv({})).toMatchObject({
      host: '127.0.0.1',
      port: 3333,
      path: '/mcp',
      modules: ['math', 'finance', 'statistics', 'datetime', 'units'],
    });
  });

  it('parses lists and rejects unknown modules / ports', () => {
    expect(settingsFromEnv({ DETERMINISTIC_TOOLS_MODULES: 'math, units', ALLOWED_ORIGINS: 'https://a.example,https://b.example' })).toMatchObject({
      modules: ['math', 'units'],
      allowedOrigins: ['https://a.example', 'https://b.example'],
    });
    expect(() => settingsFromEnv({ DETERMINISTIC_TOOLS_MODULES: 'math,chemistry' })).toThrow(/chemistry/);
    expect(() => settingsFromEnv({ PORT: 'abc' })).toThrow(/PORT/);
  });

  it('refuses unauthenticated public binds', () => {
    expect(() => createApp(settingsFromEnv({ HOST: '0.0.0.0' }))).toThrow(/without authentication/);
    expect(() => createApp(settingsFromEnv({ HOST: '0.0.0.0', DETERMINISTIC_TOOLS_AUTH_TOKEN: 't' }))).not.toThrow();
    expect(() => createApp(settingsFromEnv({ HOST: '0.0.0.0', DETERMINISTIC_TOOLS_ALLOW_UNAUTHENTICATED: 'true' }))).not.toThrow();
  });

  it('serves only the configured modules', async () => {
    const running = await createApp(settingsFromEnv({ PORT: '0', DETERMINISTIC_TOOLS_MODULES: 'units' })).listen();
    try {
      const health = await (await fetch(running.url.replace(/\/mcp$/, '/healthz'))).json();
      expect(health).toEqual({ status: 'ok', tools: 2 });
    } finally {
      await running.close();
    }
  });
});
