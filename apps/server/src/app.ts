import { createRegistry, type Module } from '@rickrosten/agent-deterministic-tools-core';
import { datetimeModule } from '@rickrosten/agent-deterministic-tools-datetime';
import { financeModule } from '@rickrosten/agent-deterministic-tools-finance';
import { mathModule } from '@rickrosten/agent-deterministic-tools-math';
import { createStreamableHttpServer, isLoopbackHost, type Logger } from '@rickrosten/agent-deterministic-tools-mcp';
import { statisticsModule } from '@rickrosten/agent-deterministic-tools-statistics';
import { unitsModule } from '@rickrosten/agent-deterministic-tools-units';

const MODULES: readonly Module[] = [mathModule, financeModule, statisticsModule, datetimeModule, unitsModule];

export interface ServerSettings {
  host: string;
  port: number;
  path: string;
  modules: string[];
  authToken?: string;
  publicUrl?: string;
  allowedOrigins: string[];
  allowedHosts: string[];
  authorizationServers: string[];
  allowUnauthenticated: boolean;
}

const list = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Reads deployment settings from environment variables. Environment variables configure the
 * server process only; tools never read them.
 */
export function settingsFromEnv(env: Record<string, string | undefined>): ServerSettings {
  const port = Number(env['PORT'] ?? 3333);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid PORT: ${env['PORT']}`);
  const modules = list(env['DETERMINISTIC_TOOLS_MODULES']);
  const unknown = modules.filter((id) => !MODULES.some((m) => m.id === id));
  if (unknown.length) throw new Error(`Unknown module(s) in DETERMINISTIC_TOOLS_MODULES: ${unknown.join(', ')}`);
  const settings: ServerSettings = {
    host: env['HOST'] ?? '127.0.0.1',
    port,
    path: env['MCP_PATH'] ?? '/mcp',
    modules: modules.length ? modules : MODULES.map((m) => m.id),
    allowedOrigins: list(env['ALLOWED_ORIGINS']),
    allowedHosts: list(env['ALLOWED_HOSTS']),
    authorizationServers: list(env['AUTHORIZATION_SERVERS']),
    allowUnauthenticated: env['DETERMINISTIC_TOOLS_ALLOW_UNAUTHENTICATED'] === 'true',
  };
  if (env['DETERMINISTIC_TOOLS_AUTH_TOKEN']) settings.authToken = env['DETERMINISTIC_TOOLS_AUTH_TOKEN'];
  if (env['PUBLIC_URL']) settings.publicUrl = env['PUBLIC_URL'];
  return settings;
}

export function createApp(settings: ServerSettings, logger?: Logger) {
  if (!isLoopbackHost(settings.host) && !settings.authToken && !settings.allowUnauthenticated) {
    throw new Error(
      `Refusing to listen on ${settings.host} without authentication. Set DETERMINISTIC_TOOLS_AUTH_TOKEN, or DETERMINISTIC_TOOLS_ALLOW_UNAUTHENTICATED=true behind an authenticating proxy.`,
    );
  }
  const registry = createRegistry(MODULES).setEnabledModules(settings.modules);
  return createStreamableHttpServer(registry, {
    host: settings.host,
    port: settings.port,
    path: settings.path,
    allowedOrigins: settings.allowedOrigins,
    allowedHosts: settings.allowedHosts,
    ...(settings.publicUrl ? { publicUrl: settings.publicUrl } : {}),
    ...(logger ? { logger } : {}),
    ...(settings.authToken || settings.authorizationServers.length
      ? {
          auth: {
            ...(settings.authToken ? { bearerToken: settings.authToken } : {}),
            ...(settings.authorizationServers.length ? { resourceMetadata: { authorizationServers: settings.authorizationServers } } : {}),
          },
        }
      : {}),
  });
}
