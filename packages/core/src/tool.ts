import type { z } from 'zod';
import { RegistryError } from './errors.js';

/**
 * Per-call context. Intentionally contains no clock, randomness, environment or I/O:
 * anything a tool depends on must be part of its validated input.
 */
export interface ToolContext {
  /** Fully-qualified tool name, e.g. `math.percentage_change`. */
  readonly toolName: string;
  /** Opaque identifier supplied by the transport for correlation. */
  readonly requestId?: string | undefined;
  /** Cancellation signal supplied by the transport. */
  readonly signal?: AbortSignal | undefined;
}

export interface ToolExample {
  readonly description?: string;
  readonly input: unknown;
  readonly output?: unknown;
}

/** Hints for tool-calling clients (mirrors MCP tool annotations). */
export interface ToolAnnotations {
  readonly readOnlyHint?: boolean;
  readonly idempotentHint?: boolean;
  readonly destructiveHint?: boolean;
  readonly openWorldHint?: boolean;
}

/** Validated input type received by `execute`. */
export type ToolInput<T extends AnyTool> = T extends Tool<infer I, unknown> ? I : never;
/** Validated result type produced by a tool. */
export type ToolOutput<T extends AnyTool> = T extends Tool<unknown, infer O> ? O : never;

export interface Tool<I = unknown, O = unknown> {
  /** Local snake_case name, unique inside its module. The registry prefixes it with the module id. */
  readonly name: string;
  readonly title?: string | undefined;
  /** One or two sentences: what the tool computes. */
  readonly description: string;
  readonly whenToUse: readonly string[];
  readonly whenNotToUse: readonly string[];
  readonly limitations: readonly string[];
  readonly examples: readonly ToolExample[];
  readonly annotations: ToolAnnotations;
  readonly inputSchema: z.ZodType<I>;
  readonly outputSchema: z.ZodType<O>;
  execute(input: I, context: ToolContext): O | Promise<O>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTool = Tool<any, any>;

export interface ToolDefinition<IS extends z.ZodType, OS extends z.ZodType> {
  name: string;
  title?: string;
  description: string;
  whenToUse?: string | readonly string[];
  whenNotToUse?: string | readonly string[];
  limitations?: string | readonly string[];
  examples?: readonly ToolExample[];
  annotations?: ToolAnnotations;
  input: IS;
  output: OS;
  execute(input: z.output<IS>, context: ToolContext): z.output<OS> | Promise<z.output<OS>>;
}

export const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

const DEFAULT_ANNOTATIONS: ToolAnnotations = Object.freeze({
  readOnlyHint: true,
  idempotentHint: true,
  destructiveHint: false,
  openWorldHint: false,
});

function toList(value: string | readonly string[] | undefined): readonly string[] {
  if (value === undefined) return Object.freeze([]);
  return Object.freeze(typeof value === 'string' ? [value] : [...value]);
}

/**
 * Declares a deterministic tool. Returns a frozen object; the same definition can be
 * registered in any number of registries without shared mutable state.
 */
export function defineTool<IS extends z.ZodType, OS extends z.ZodType>(
  definition: ToolDefinition<IS, OS>,
): Tool<z.output<IS>, z.output<OS>> {
  if (!TOOL_NAME_PATTERN.test(definition.name)) {
    throw new RegistryError(
      'INVALID_TOOL',
      `Invalid tool name "${definition.name}": use lowercase snake_case (a-z, 0-9, _), max 64 chars, no dots.`,
    );
  }
  if (!definition.description.trim()) {
    throw new RegistryError('INVALID_TOOL', `Tool "${definition.name}" must have a description.`);
  }
  const tool: Tool<z.output<IS>, z.output<OS>> = {
    name: definition.name,
    title: definition.title,
    description: definition.description.trim(),
    whenToUse: toList(definition.whenToUse),
    whenNotToUse: toList(definition.whenNotToUse),
    limitations: toList(definition.limitations),
    examples: Object.freeze([...(definition.examples ?? [])]),
    annotations: Object.freeze({ ...DEFAULT_ANNOTATIONS, ...definition.annotations }),
    inputSchema: definition.input as z.ZodType<z.output<IS>>,
    outputSchema: definition.output as z.ZodType<z.output<OS>>,
    execute: definition.execute,
  };
  return Object.freeze(tool);
}

export function isTool(value: unknown): value is AnyTool {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['name'] === 'string' &&
    typeof v['description'] === 'string' &&
    typeof v['execute'] === 'function' &&
    typeof v['inputSchema'] === 'object' &&
    v['inputSchema'] !== null &&
    typeof (v['inputSchema'] as { safeParse?: unknown }).safeParse === 'function' &&
    typeof v['outputSchema'] === 'object' &&
    v['outputSchema'] !== null &&
    typeof (v['outputSchema'] as { safeParse?: unknown }).safeParse === 'function'
  );
}
