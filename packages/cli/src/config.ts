import { z } from '@rickrosten/agent-deterministic-tools-core';
import { readJsonObject, writeJsonFile } from './fsutil.js';

export const CONFIG_SCHEMA_URL = 'https://unpkg.com/@rickrosten/agent-deterministic-tools@1/config.schema.json';

export const HttpConfigSchema = z.strictObject({
  host: z.string().optional().describe('Interface to bind. Default 127.0.0.1.'),
  port: z.number().int().min(0).max(65535).optional().describe('Port. Default 3333.'),
  path: z.string().startsWith('/').optional().describe('Endpoint path. Default /mcp.'),
  publicUrl: z.string().url().optional().describe('Public base URL used in auth metadata.'),
  allowedOrigins: z.array(z.string()).optional(),
  allowedHosts: z.array(z.string()).optional(),
  authorizationServers: z.array(z.string().url()).optional().describe('OAuth authorization servers advertised via RFC 9728 metadata.'),
});

export const ConfigSchema = z.strictObject({
  $schema: z.string().optional(),
  modules: z
    .array(z.string())
    .optional()
    .describe('Enabled module ids. Omit to enable every installed module.'),
  plugins: z
    .array(z.string())
    .optional()
    .describe('Explicitly allowed third-party module packages (npm names or local paths). Nothing else is ever loaded.'),
  disabledTools: z.array(z.string()).optional().describe('Fully-qualified tool names to hide, e.g. "finance.irr".'),
  logInputs: z.boolean().optional().describe('Include tool input values in debug execution logs. Default false.'),
  http: HttpConfigSchema.optional(),
});

export type Config = z.infer<typeof ConfigSchema>;
export type HttpConfig = z.infer<typeof HttpConfigSchema>;

export class ConfigError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface LoadedConfig {
  path: string;
  exists: boolean;
  config: Config;
}

export function loadConfig(path: string): LoadedConfig {
  let raw: Record<string, unknown> | undefined;
  try {
    raw = readJsonObject(path);
  } catch (error) {
    throw new ConfigError(path, error instanceof Error ? error.message : String(error));
  }
  if (raw === undefined) return { path, exists: false, config: {} };
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    const where = issue.path.length ? issue.path.join('.') : '(root)';
    throw new ConfigError(path, `Invalid configuration in ${path} at ${where}: ${issue.message}`);
  }
  return { path, exists: true, config: parsed.data };
}

export function saveConfig(path: string, config: Config): void {
  const { $schema: _ignored, ...rest } = config;
  writeJsonFile(path, { $schema: CONFIG_SCHEMA_URL, ...rest });
}

/** Default configuration written by `config init` and the setup wizard. */
export function defaultConfig(moduleIds: readonly string[]): Config {
  return { modules: [...moduleIds] };
}
