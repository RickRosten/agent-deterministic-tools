import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { RunningHttpServer } from '@rickrosten/agent-deterministic-tools-mcp';
import { createApp, settingsFromEnv } from '../../apps/server/src/app.js';

let running: RunningHttpServer;
let client: Client;

beforeAll(async () => {
  running = await createApp(settingsFromEnv({ PORT: '0', DETERMINISTIC_TOOLS_AUTH_TOKEN: 'integration-token' })).listen();
  client = new Client({ name: 'integration', version: '1.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(running.url), { requestInit: { headers: { authorization: 'Bearer integration-token' } } }) as Transport,
  );
});

afterAll(async () => {
  await client?.close();
  await running?.close();
});

const call = async (name: string, args: Record<string, unknown>) => {
  const res = await client.callTool({ name, arguments: args });
  if (res.isError) throw new Error(JSON.stringify(res.content));
  return res.structuredContent as Record<string, unknown>;
};

describe('Streamable HTTP end-to-end (server app)', () => {
  it('lists all tools with input and output schemas', async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(43);
    for (const t of tools) {
      expect(t.inputSchema.type).toBe('object');
      expect(t.outputSchema?.type).toBe('object');
      expect(t.description!.length).toBeGreaterThan(20);
    }
  });

  it('calls one tool of every module', async () => {
    expect(await call('math.percentage_change', { oldValue: 80, newValue: 100 })).toMatchObject({ result: 25 });
    expect(
      await call('finance.compound_interest', { principal: 10000, annualRatePercent: 5, rateType: 'nominal', compoundingPerYear: 12, years: 10, currency: 'EUR' }),
    ).toMatchObject({ result: 16470.09, formatted: '€16,470.09' });
    expect(await call('statistics.standard_deviation', { values: [2, 4, 4, 4, 5, 5, 7, 9], kind: 'population' })).toMatchObject({ result: 2 });
    expect(await call('datetime.business_days_between', { start: '2026-06-01', end: '2026-06-30' })).toMatchObject({ result: 22 });
    expect(await call('units.convert', { value: 1, from: 'GiB', to: 'MB' })).toMatchObject({ result: 1073.741824 });
  });

  it('returns structured errors', async () => {
    const res = await client.callTool({ name: 'units.convert', arguments: { value: 1, from: 'gal', to: 'L' } });
    expect(res.isError).toBe(true);
    expect(JSON.parse((res.content as Array<{ text: string }>)[0]!.text)).toMatchObject({ error: { code: 'INVALID_UNIT', field: 'from' } });
  });
});
