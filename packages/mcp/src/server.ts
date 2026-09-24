import { formatToolDescription, type ExecutionObserver, type ToolDescriptor, type ToolRegistry } from '@rickrosten/agent-deterministic-tools-core';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ErrorCode as McpErrorCode,
  ListToolsRequestSchema,
  McpError,
  type CallToolResult,
  type Tool as McpTool,
} from '@modelcontextprotocol/sdk/types.js';

export const SERVER_NAME = 'deterministic-tools';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type Logger = (level: LogLevel, message: string, data?: Record<string, unknown>) => void;

export const silentLogger: Logger = () => undefined;

export interface McpServerOptions {
  name?: string;
  version?: string;
  /** Overrides the auto-generated server instructions. */
  instructions?: string;
  logger?: Logger;
  /** Receives an execution record for every tools/call. */
  onExecution?: ExecutionObserver;
}

/** Converts a registry descriptor into an MCP tool definition. */
export function toMcpTool(descriptor: ToolDescriptor): McpTool {
  return {
    name: descriptor.name,
    title: descriptor.title,
    description: formatToolDescription(descriptor),
    inputSchema: descriptor.inputSchema as McpTool['inputSchema'],
    outputSchema: descriptor.outputSchema as McpTool['outputSchema'],
    annotations: {
      title: descriptor.title,
      readOnlyHint: descriptor.annotations.readOnlyHint ?? true,
      destructiveHint: descriptor.annotations.destructiveHint ?? false,
      idempotentHint: descriptor.annotations.idempotentHint ?? true,
      openWorldHint: descriptor.annotations.openWorldHint ?? false,
    },
    _meta: {
      'deterministic-tools/module': descriptor.moduleId,
      'deterministic-tools/moduleVersion': descriptor.moduleVersion,
    },
  };
}

/** Builds short server instructions from the enabled modules. */
export function buildInstructions(registry: ToolRegistry): string {
  const modules = registry
    .listModules()
    .filter((m) => m.enabled && registry.list({ moduleId: m.id }).length > 0)
    .map((m) => `- ${m.id}: ${m.description}`);
  return [
    'Deterministic calculation tools. Use them for any arithmetic, financial, statistical, date or unit calculation instead of computing the result yourself; they return exact, validated, structured results.',
    'Tool names are namespaced as <module>.<tool>. Errors are returned as JSON {"error": {"code", "message", "field"}}; fix the named field and retry.',
    'Enabled modules:',
    ...modules,
  ].join('\n');
}

function isObjectSchema(schema: Record<string, unknown>): boolean {
  return schema['type'] === 'object';
}

/**
 * Creates an MCP server whose tools/list and tools/call are generated from the registry.
 * The registry is read on every request, so enabling/disabling tools takes effect immediately.
 */
export function createMcpServer(registry: ToolRegistry, options: McpServerOptions = {}): Server {
  const logger = options.logger ?? silentLogger;
  const server = new Server(
    { name: options.name ?? SERVER_NAME, version: options.version ?? '1.0.0' },
    {
      capabilities: { tools: { listChanged: false } },
      instructions: options.instructions ?? buildInstructions(registry),
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools: McpTool[] = [];
    for (const descriptor of registry.describeAll()) {
      if (!isObjectSchema(descriptor.inputSchema) || !isObjectSchema(descriptor.outputSchema)) {
        logger('warn', `skipping ${descriptor.name}: MCP requires object input and output schemas`);
        continue;
      }
      tools.push(toMcpTool(descriptor));
    }
    logger('debug', 'tools/list', { count: tools.length });
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request, extra): Promise<CallToolResult> => {
    const { name, arguments: args } = request.params;
    if (!registry.isEnabled(name)) {
      throw new McpError(McpErrorCode.InvalidParams, `Unknown tool: ${name}`);
    }
    const result = await registry.execute(name, args ?? {}, {
      requestId: String(extra.requestId),
      signal: extra.signal,
      ...(options.onExecution ? { observer: options.onExecution } : {}),
    });
    if (result.ok) {
      const data = result.data as Record<string, unknown>;
      return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
    }
    logger('debug', 'tool error', { tool: name, code: result.error.code });
    return { content: [{ type: 'text', text: JSON.stringify({ error: result.error }) }], isError: true };
  });

  return server;
}
