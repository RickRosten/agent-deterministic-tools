import { afterEach, describe, expect, it } from 'vitest';
import { createRegistry, type ExecutionRecord } from '@rickrosten/agent-deterministic-tools-core';
import { financeModule } from '@rickrosten/agent-deterministic-tools-finance';
import { mathModule } from '@rickrosten/agent-deterministic-tools-math';
import { connectInMemory, createStreamableHttpServer, type RunningHttpServer } from '@rickrosten/agent-deterministic-tools-mcp';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

const registry = () => createRegistry([mathModule, financeModule]);

describe('MCP over in-memory transport', () => {
  it('tools/list is generated from the registry with schemas and LLM-oriented descriptions', async () => {
    const { client, close } = await connectInMemory(registry());
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(24);
    const tool = tools.find((t) => t.name === 'math.percentage_change')!;
    expect(tool.inputSchema).toMatchObject({ type: 'object', required: ['oldValue', 'newValue'], additionalProperties: false });
    expect(tool.outputSchema).toMatchObject({ type: 'object' });
    expect(tool.description).toContain('Use when:');
    expect(tool.description).toContain('Do not use when:');
    expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: false });
    expect(client.getInstructions()).toContain('math:');
    await close();
  });

  it('tools/call returns structured content', async () => {
    const { client, close } = await connectInMemory(registry());
    const res = await client.callTool({ name: 'math.percentage_change', arguments: { oldValue: 50, newValue: 75 } });
    expect(res.isError).toBeFalsy();
    expect(res.structuredContent).toEqual({ result: 50, unit: 'percent', absoluteChange: 25, direction: 'increase' });
    expect(JSON.parse((res.content as Array<{ text: string }>)[0]!.text)).toEqual(res.structuredContent);
    await close();
  });

  it('tool errors are structured and contain no stack trace', async () => {
    const { client, close } = await connectInMemory(registry());
    const res = await client.callTool({
      name: 'finance.compound_interest',
      arguments: { principal: 1000, annualRatePercent: -150, rateType: 'nominal', compoundingPerYear: 12, years: 1 },
    });
    expect(res.isError).toBe(true);
    const payload = JSON.parse((res.content as Array<{ text: string }>)[0]!.text);
    expect(payload).toEqual({
      error: { code: 'INVALID_INPUT', message: 'annualRatePercent must be greater than -100', field: 'annualRatePercent' },
    });
    expect(JSON.stringify(res)).not.toMatch(/at \w+ \(/);
    await close();
  });

  it('only exposes enabled tools', async () => {
    const reg = registry().disableModule('finance').disableTool('math.power');
    const { client, close } = await connectInMemory(reg);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).not.toContain('finance.npv');
    expect(tools.map((t) => t.name)).not.toContain('math.power');
    await expect(client.callTool({ name: 'finance.npv', arguments: {} })).rejects.toThrow(/Unknown tool/);
    await close();
  });

  it('reports execution records', async () => {
    const records: ExecutionRecord[] = [];
    const { client, close } = await connectInMemory(registry(), { onExecution: (r) => records.push(r) });
    await client.callTool({ name: 'math.sum', arguments: { values: [1, 2] } });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ tool: 'math.sum', status: 'success', inputFields: ['values'] });
    expect(records[0]).not.toHaveProperty('input');
    await close();
  });
});

describe('MCP over Streamable HTTP', () => {
  let running: RunningHttpServer | undefined;
  afterEach(async () => {
    await running?.close();
    running = undefined;
  });

  const connect = async (url: string, headers: Record<string, string> = {}) => {
    const client = new Client({ name: 'test', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } }) as Transport);
    return client;
  };

  it('serves tools/list and tools/call', async () => {
    running = await createStreamableHttpServer(registry(), { port: 0 }).listen();
    expect(running.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
    const client = await connect(running.url);
    const { tools } = await client.listTools();
    expect(tools.length).toBe(24);
    const res = await client.callTool({ name: 'math.sum', arguments: { values: [0.1, 0.2] } });
    expect(res.structuredContent).toEqual({ result: 0.3, count: 2 });
    await client.close();
  });

  it('health endpoint and 404/405', async () => {
    running = await createStreamableHttpServer(registry(), { port: 0 }).listen();
    const base = running.url.replace(/\/mcp$/, '');
    expect(await (await fetch(`${base}/healthz`)).json()).toEqual({ status: 'ok', tools: 24 });
    expect((await fetch(`${base}/nope`)).status).toBe(404);
    expect((await fetch(running.url)).status).toBe(405);
  });

  it('requires the bearer token when configured', async () => {
    running = await createStreamableHttpServer(registry(), { port: 0, auth: { bearerToken: 'secret-token' } }).listen();
    const denied = await fetch(running.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(denied.status).toBe(401);
    expect(denied.headers.get('www-authenticate')).toContain('Bearer');
    await expect(connect(running.url, { authorization: 'Bearer wrong' })).rejects.toThrow();
    const client = await connect(running.url, { authorization: 'Bearer secret-token' });
    expect((await client.listTools()).tools.length).toBe(24);
    await client.close();
  });

  it('publishes protected resource metadata for OAuth deployments', async () => {
    running = await createStreamableHttpServer(registry(), {
      port: 0,
      publicUrl: 'https://mcp.example.com',
      auth: {
        authenticate: (_req, token) => (token === 'valid' ? { token, clientId: 'c1', scopes: ['tools'] } : null),
        resourceMetadata: { authorizationServers: ['https://auth.example.com'], scopesSupported: ['tools'] },
      },
    }).listen();
    const base = running.url.replace(/\/mcp$/, '');
    const meta = await (await fetch(`${base}/.well-known/oauth-protected-resource`)).json();
    expect(meta).toEqual({
      resource: 'https://mcp.example.com/mcp',
      authorization_servers: ['https://auth.example.com'],
      scopes_supported: ['tools'],
      bearer_methods_supported: ['header'],
    });
    const denied = await fetch(running.url, { method: 'POST', body: '{}' });
    expect(denied.status).toBe(401);
    expect(denied.headers.get('www-authenticate')).toBe(
      'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"',
    );
    const client = await connect(running.url, { authorization: 'Bearer valid' });
    expect((await client.listTools()).tools.length).toBe(24);
    await client.close();
  });

  it('rejects foreign Origin and Host headers on loopback binds', async () => {
    running = await createStreamableHttpServer(registry(), { port: 0 }).listen();
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
    const evil = await fetch(running.url, { method: 'POST', body, headers: { ...headers, origin: 'https://evil.example' } });
    expect(evil.status).toBe(403);
    const port = new URL(running.url).port;
    const { request } = await import('node:http');
    const status = await new Promise<number>((resolve) => {
      const req = request({ host: '127.0.0.1', port, path: '/mcp', method: 'POST', headers: { ...headers, host: 'evil.example' } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.end(body);
    });
    expect(status).toBe(403);
  });
});
