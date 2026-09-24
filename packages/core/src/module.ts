import { RegistryError } from './errors.js';
import { isTool, TOOL_NAME_PATTERN, type AnyTool } from './tool.js';

/** Version of the module contract. Bumped only on breaking changes to `Module`. */
export const MODULE_API_VERSION = 1;

export const MODULE_ID_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export interface Module {
  /** Namespace for the module's tools, e.g. `math` produces `math.sum`. */
  readonly id: string;
  readonly name: string;
  /** Semantic version of the module's public tool API. */
  readonly version: string;
  readonly description: string;
  readonly tools: readonly AnyTool[];
  /** Module contract version the module was built against. Defaults to 1. */
  readonly apiVersion?: number;
  readonly homepage?: string;
}

export interface ModuleDefinition {
  id: string;
  name: string;
  version: string;
  description: string;
  tools: readonly AnyTool[];
  apiVersion?: number;
  homepage?: string;
}

/**
 * Validates a module object and throws a descriptive `RegistryError` if it is malformed.
 * Used for both built-in and third-party modules.
 */
export function assertValidModule(value: unknown): asserts value is Module {
  if (typeof value !== 'object' || value === null) {
    throw new RegistryError('INVALID_MODULE', 'Module must be an object.');
  }
  const m = value as Record<string, unknown>;
  const id = m['id'];
  if (typeof id !== 'string' || !MODULE_ID_PATTERN.test(id)) {
    throw new RegistryError(
      'INVALID_MODULE',
      `Invalid module id ${JSON.stringify(id)}: use lowercase letters, digits, "-" or "_", starting with a letter (max 32 chars).`,
    );
  }
  for (const key of ['name', 'description'] as const) {
    if (typeof m[key] !== 'string' || !(m[key] as string).trim()) {
      throw new RegistryError('INVALID_MODULE', `Module "${id}" must have a non-empty "${key}".`);
    }
  }
  if (typeof m['version'] !== 'string' || !SEMVER_PATTERN.test(m['version'])) {
    throw new RegistryError('INVALID_MODULE', `Module "${id}" must have a semantic "version" (MAJOR.MINOR.PATCH).`);
  }
  const apiVersion = m['apiVersion'] ?? MODULE_API_VERSION;
  if (apiVersion !== MODULE_API_VERSION) {
    throw new RegistryError(
      'INVALID_MODULE',
      `Module "${id}" targets module API v${String(apiVersion)}, but this runtime supports v${MODULE_API_VERSION}.`,
    );
  }
  const tools = m['tools'];
  if (!Array.isArray(tools)) {
    throw new RegistryError('INVALID_MODULE', `Module "${id}" must export a "tools" array.`);
  }
  const seen = new Set<string>();
  for (const tool of tools) {
    if (!isTool(tool)) {
      throw new RegistryError('INVALID_MODULE', `Module "${id}" contains an entry that is not a tool. Use defineTool().`);
    }
    if (!TOOL_NAME_PATTERN.test(tool.name)) {
      throw new RegistryError('INVALID_TOOL', `Module "${id}" has a tool with invalid name "${tool.name}".`);
    }
    if (seen.has(tool.name)) {
      throw new RegistryError('NAME_CONFLICT', `Module "${id}" defines tool "${tool.name}" more than once.`);
    }
    seen.add(tool.name);
  }
}

/** Declares a module. Validates it eagerly and returns a frozen object. */
export function defineModule(definition: ModuleDefinition): Module {
  const module: Module = Object.freeze({
    ...definition,
    apiVersion: definition.apiVersion ?? MODULE_API_VERSION,
    tools: Object.freeze([...definition.tools]),
  });
  assertValidModule(module);
  return module;
}
