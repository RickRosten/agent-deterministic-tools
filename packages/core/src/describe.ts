import { z } from 'zod';
import type { AnyTool, ToolAnnotations, ToolExample } from './tool.js';

export type JsonSchema = Record<string, unknown>;

/** Transport-neutral description of a registered tool, used by adapters and docs. */
export interface ToolDescriptor {
  /** Fully-qualified name, e.g. `finance.npv`. */
  name: string;
  moduleId: string;
  moduleVersion: string;
  localName: string;
  title: string;
  description: string;
  whenToUse: readonly string[];
  whenNotToUse: readonly string[];
  limitations: readonly string[];
  examples: readonly ToolExample[];
  annotations: ToolAnnotations;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

function stripMeta(schema: JsonSchema): JsonSchema {
  const { $schema: _ignored, ...rest } = schema;
  return rest;
}

/** Converts a zod schema to JSON Schema (draft 2020-12) without the `$schema` marker. */
export function toJsonSchema(schema: z.ZodType, io: 'input' | 'output'): JsonSchema {
  return stripMeta(
    z.toJSONSchema(schema, { target: 'draft-2020-12', io, unrepresentable: 'any', reused: 'inline' }) as JsonSchema,
  );
}

function titleFromName(name: string): string {
  return name
    .split('_')
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export function describeTool(moduleId: string, moduleVersion: string, tool: AnyTool): ToolDescriptor {
  return {
    name: `${moduleId}.${tool.name}`,
    moduleId,
    moduleVersion,
    localName: tool.name,
    title: tool.title ?? titleFromName(tool.name),
    description: tool.description,
    whenToUse: tool.whenToUse,
    whenNotToUse: tool.whenNotToUse,
    limitations: tool.limitations,
    examples: tool.examples,
    annotations: tool.annotations,
    inputSchema: toJsonSchema(tool.inputSchema, 'input'),
    outputSchema: toJsonSchema(tool.outputSchema, 'output'),
  };
}

export interface FormatDescriptionOptions {
  /** Include the first example as compact JSON. Default true. */
  includeExample?: boolean;
}

/**
 * Builds a description optimized for LLM tool selection: purpose first, then explicit
 * use / do-not-use guidance and limitations. Schemas are transmitted separately.
 */
export function formatToolDescription(descriptor: ToolDescriptor, options: FormatDescriptionOptions = {}): string {
  const lines: string[] = [descriptor.description];
  if (descriptor.whenToUse.length) lines.push(`Use when: ${descriptor.whenToUse.join('; ')}.`);
  if (descriptor.whenNotToUse.length) lines.push(`Do not use when: ${descriptor.whenNotToUse.join('; ')}.`);
  if (descriptor.limitations.length) lines.push(`Limitations: ${descriptor.limitations.join('; ')}.`);
  const example = descriptor.examples[0];
  if ((options.includeExample ?? true) && example) {
    lines.push(`Example input: ${JSON.stringify(example.input)}`);
  }
  lines.push('Deterministic: same input always yields the same output. Errors are returned as {code, message, field}.');
  return lines.join('\n');
}
