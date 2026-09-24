import type { ToolRegistry } from '@rickrosten/agent-deterministic-tools-core';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer, type McpServerOptions } from './server.js';

/**
 * Serves the registry over stdio (the local integration mode used by Claude Desktop,
 * Cursor and other MCP clients). stdout is reserved for protocol messages: log to stderr.
 */
export async function serveStdio(registry: ToolRegistry, options: McpServerOptions = {}): Promise<Server> {
  const server = createMcpServer(registry, options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  options.logger?.('info', 'MCP server listening on stdio', { tools: registry.list().length });
  return server;
}
