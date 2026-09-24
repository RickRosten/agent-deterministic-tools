import {
  ErrorCode,
  formatToolDescription,
  type ExecuteOptions,
  type JsonSchema,
  type ToolDescriptor,
  type ToolRegistry,
  type ToolResult,
} from '@rickrosten/agent-deterministic-tools-core';

/**
 * OpenAI function names must match ^[a-zA-Z0-9_-]{1,64}$, so the namespace dot is encoded
 * as a double underscore: `finance.loan_payment` <-> `finance__loan_payment`.
 */
export const NAME_SEPARATOR = '__';

export function toOpenAIName(toolName: string): string {
  return toolName.replace('.', NAME_SEPARATOR);
}

export function fromOpenAIName(functionName: string): string {
  const i = functionName.indexOf(NAME_SEPARATOR);
  return i === -1 ? functionName : `${functionName.slice(0, i)}.${functionName.slice(i + NAME_SEPARATOR.length)}`;
}

export interface ToOpenAIToolsOptions {
  /** Restrict to these fully-qualified tool names or module ids. */
  include?: string[];
  /**
   * Emit strict schemas (OpenAI structured outputs): every property becomes required and
   * optional ones become nullable. Pass the same flag to `handleOpenAIToolCall`, which
   * removes the resulting nulls before validation. Default false.
   */
  strict?: boolean;
}

export interface ChatCompletionsTool {
  type: 'function';
  function: { name: string; description: string; parameters: JsonSchema; strict?: boolean };
}

export interface ResponsesTool {
  type: 'function';
  name: string;
  description: string;
  parameters: JsonSchema;
  strict: boolean;
}

function selected(registry: ToolRegistry, include: string[] | undefined): ToolDescriptor[] {
  const all = registry.describeAll();
  if (!include?.length) return all;
  const wanted = new Set(include);
  return all.filter((d) => wanted.has(d.name) || wanted.has(d.moduleId));
}

const STRICT_UNSUPPORTED = new Set(['default', '$schema']);

/** Rewrites a JSON schema for OpenAI strict mode (all properties required, optional ones nullable). */
export function toStrictSchema(schema: JsonSchema): JsonSchema {
  const out: JsonSchema = {};
  for (const [key, value] of Object.entries(schema)) {
    if (STRICT_UNSUPPORTED.has(key)) continue;
    out[key] = value;
  }
  if (out['type'] === 'object' && out['properties'] && typeof out['properties'] === 'object') {
    const props = out['properties'] as Record<string, JsonSchema>;
    const required = new Set((out['required'] as string[] | undefined) ?? []);
    const nextProps: Record<string, JsonSchema> = {};
    for (const [name, prop] of Object.entries(props)) {
      const strictProp = toStrictSchema(prop);
      nextProps[name] = required.has(name) ? strictProp : { anyOf: [strictProp, { type: 'null' }] };
    }
    out['properties'] = nextProps;
    out['required'] = Object.keys(nextProps);
    out['additionalProperties'] = false;
  }
  if (out['items'] && typeof out['items'] === 'object') out['items'] = toStrictSchema(out['items'] as JsonSchema);
  for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
    if (Array.isArray(out[key])) out[key] = (out[key] as JsonSchema[]).map(toStrictSchema);
  }
  return out;
}

function parametersFor(d: ToolDescriptor, strict: boolean): JsonSchema {
  return strict ? toStrictSchema(d.inputSchema) : d.inputSchema;
}

/** Tool definitions for the Chat Completions API (`tools` parameter). */
export function toChatCompletionsTools(registry: ToolRegistry, options: ToOpenAIToolsOptions = {}): ChatCompletionsTool[] {
  const strict = options.strict ?? false;
  return selected(registry, options.include).map((d) => ({
    type: 'function',
    function: {
      name: toOpenAIName(d.name),
      description: formatToolDescription(d),
      parameters: parametersFor(d, strict),
      ...(strict ? { strict: true } : {}),
    },
  }));
}

/** Tool definitions for the Responses API (`tools` parameter). */
export function toResponsesTools(registry: ToolRegistry, options: ToOpenAIToolsOptions = {}): ResponsesTool[] {
  const strict = options.strict ?? false;
  return selected(registry, options.include).map((d) => ({
    type: 'function',
    name: toOpenAIName(d.name),
    description: formatToolDescription(d),
    parameters: parametersFor(d, strict),
    strict,
  }));
}

/** Alias selecting the API flavour. */
export function toOpenAITools(
  registry: ToolRegistry,
  options: ToOpenAIToolsOptions & { api?: 'responses' | 'chat_completions' } = {},
): ChatCompletionsTool[] | ResponsesTool[] {
  return options.api === 'chat_completions' ? toChatCompletionsTools(registry, options) : toResponsesTools(registry, options);
}

function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== null)
        .map(([k, v]) => [k, stripNulls(v)]),
    );
  }
  return value;
}

export interface ToolCallInput {
  /** Function name as sent by the model (e.g. `math__sum`) or the registry name. */
  name: string;
  /** JSON string (as sent by the API) or an already-parsed object. */
  arguments: string | Record<string, unknown> | undefined;
}

export interface ToolCallOutput {
  /** Fully-qualified registry tool name. */
  tool: string;
  result: ToolResult;
  /** JSON string to send back to the model: the data, or `{"error": {...}}`. */
  output: string;
}

export interface HandleToolCallOptions extends Omit<ExecuteOptions, 'toolName'> {
  /** Set when the tools were generated with `strict: true`. */
  strict?: boolean;
}

/** Executes one function call from the model against the registry. Never throws. */
export async function handleOpenAIToolCall(
  registry: ToolRegistry,
  call: ToolCallInput,
  options: HandleToolCallOptions = {},
): Promise<ToolCallOutput> {
  let tool = fromOpenAIName(call.name);
  if (!registry.has(tool)) tool = registry.list().find((t) => toOpenAIName(t.name) === call.name)?.name ?? tool;
  let args: unknown = call.arguments ?? {};
  if (typeof args === 'string') {
    try {
      args = args.trim() ? JSON.parse(args) : {};
    } catch {
      const result: ToolResult = {
        ok: false,
        error: { code: ErrorCode.INVALID_INPUT, message: 'arguments are not valid JSON' },
      };
      return { tool, result, output: JSON.stringify({ error: result.error }) };
    }
  }
  const { strict, ...execOptions } = options;
  if (strict) args = stripNulls(args);
  const result = await registry.execute(tool, args, execOptions);
  return { tool, result, output: JSON.stringify(result.ok ? result.data : { error: result.error }) };
}

export interface ChatToolCall {
  id: string;
  type?: 'function';
  function: { name: string; arguments: string };
}

export interface ChatToolMessage {
  role: 'tool';
  tool_call_id: string;
  content: string;
}

/** Executes all `message.tool_calls` of a Chat Completions response and returns `tool` messages. */
export async function runChatToolCalls(
  registry: ToolRegistry,
  toolCalls: readonly ChatToolCall[],
  options: HandleToolCallOptions = {},
): Promise<ChatToolMessage[]> {
  return Promise.all(
    toolCalls.map(async (call) => {
      const { output } = await handleOpenAIToolCall(registry, { name: call.function.name, arguments: call.function.arguments }, options);
      return { role: 'tool' as const, tool_call_id: call.id, content: output };
    }),
  );
}

export interface ResponsesFunctionCall {
  type: 'function_call';
  call_id: string;
  name: string;
  arguments: string;
}

export interface ResponsesFunctionCallOutput {
  type: 'function_call_output';
  call_id: string;
  output: string;
}

/** Executes every `function_call` item of a Responses API `output` array. Other items are ignored. */
export async function runResponsesFunctionCalls(
  registry: ToolRegistry,
  outputItems: readonly { type: string }[],
  options: HandleToolCallOptions = {},
): Promise<ResponsesFunctionCallOutput[]> {
  const calls = outputItems.filter((i): i is ResponsesFunctionCall => i.type === 'function_call');
  return Promise.all(
    calls.map(async (call) => {
      const { output } = await handleOpenAIToolCall(registry, { name: call.name, arguments: call.arguments }, options);
      return { type: 'function_call_output' as const, call_id: call.call_id, output };
    }),
  );
}

/** Shape of `tool()` from `@openai/agents` that this adapter relies on. */
export type AgentsToolFactory<T> = (definition: {
  name: string;
  description: string;
  parameters: JsonSchema;
  strict: boolean;
  execute: (input: unknown) => Promise<string>;
}) => T;

/**
 * Builds OpenAI Agents SDK tools. Pass the SDK's `tool` function so this package does not
 * depend on `@openai/agents`:
 *
 *   import { tool } from '@openai/agents';
 *   const tools = toAgentsTools(registry, tool);
 */
export function toAgentsTools<T>(registry: ToolRegistry, factory: AgentsToolFactory<T>, options: ToOpenAIToolsOptions = {}): T[] {
  const strict = options.strict ?? false;
  return selected(registry, options.include).map((d) =>
    factory({
      name: toOpenAIName(d.name),
      description: formatToolDescription(d),
      parameters: parametersFor(d, strict),
      strict,
      execute: async (input: unknown) =>
        (await handleOpenAIToolCall(registry, { name: d.name, arguments: (input ?? {}) as Record<string, unknown> }, { strict })).output,
    }),
  );
}
