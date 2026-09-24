import type { ToolRegistry } from '@rickrosten/agent-deterministic-tools-core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer, type McpServerOptions } from './server.js';

export interface InMemoryConnection {
  client: Client;
  close(): Promise<void>;
}

/**
 * Connects an MCP client to a server over an in-memory transport. Used by
 * `deterministic-tools doctor` and tests to exercise the real MCP code path.
 */
export async function connectInMemory(registry: ToolRegistry, options: McpServerOptions = {}): Promise<InMemoryConnection> {
  const server = createMcpServer(registry, options);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'deterministic-tools-inmemory', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}
