import { describe, expect, it, vi } from 'vitest';
import { createRegistry } from '@rickrosten/agent-deterministic-tools-core';
import { financeModule } from '@rickrosten/agent-deterministic-tools-finance';
import { mathModule } from '@rickrosten/agent-deterministic-tools-math';
import {
  fromOpenAIName,
  handleOpenAIToolCall,
  runChatToolCalls,
  runResponsesFunctionCalls,
  toAgentsTools,
  toChatCompletionsTools,
  toOpenAIName,
  toOpenAITools,
  toResponsesTools,
  toStrictSchema,
} from '@rickrosten/agent-deterministic-tools-openai';

const registry = createRegistry([mathModule, financeModule]);
const NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

describe('names', () => {
  it('round-trips namespaced names into valid OpenAI function names', () => {
    for (const t of registry.list()) {
      const fn = toOpenAIName(t.name);
      expect(fn).toMatch(NAME_RE);
      expect(fromOpenAIName(fn)).toBe(t.name);
    }
    expect(toOpenAIName('finance.loan_payment')).toBe('finance__loan_payment');
  });
});

describe('tool definitions', () => {
  it('Chat Completions format', () => {
    const tools = toChatCompletionsTools(registry, { include: ['math'] });
    expect(tools).toHaveLength(13);
    expect(tools[0]).toMatchObject({
      type: 'function',
      function: { name: 'math__percentage', parameters: { type: 'object', required: ['part', 'whole'] } },
    });
    expect(tools[0]!.function.description).toContain('Use when:');
    expect(tools[0]!.function).not.toHaveProperty('strict');
  });

  it('Responses API format', () => {
    const tools = toResponsesTools(registry, { include: ['finance.npv'] });
    expect(tools).toEqual([
      expect.objectContaining({ type: 'function', name: 'finance__npv', strict: false, parameters: expect.objectContaining({ type: 'object' }) }),
    ]);
    expect(toOpenAITools(registry, { api: 'chat_completions', include: ['finance.npv'] })[0]).toHaveProperty('function');
  });

  it('strict schemas make optional fields nullable and required', () => {
    const strict = toStrictSchema({
      type: 'object',
      properties: { a: { type: 'number' }, b: { type: 'integer', default: 2 }, list: { type: 'array', items: { type: 'object', properties: { x: { type: 'string' } } } } },
      required: ['a'],
    });
    expect(strict).toEqual({
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
        list: {
          anyOf: [
            { type: 'array', items: { type: 'object', properties: { x: { anyOf: [{ type: 'string' }, { type: 'null' }] } }, required: ['x'], additionalProperties: false } },
            { type: 'null' },
          ],
        },
      },
      required: ['a', 'b', 'list'],
      additionalProperties: false,
    });
    const tools = toResponsesTools(registry, { include: ['math.round'], strict: true });
    expect(tools[0]!.strict).toBe(true);
    expect(tools[0]!.parameters['required']).toEqual(['value', 'decimals', 'mode']);
  });
});

describe('executing tool calls', () => {
  it('handles JSON string arguments', async () => {
    const out = await handleOpenAIToolCall(registry, { name: 'math__sum', arguments: '{"values":[0.1,0.2]}' });
    expect(out.tool).toBe('math.sum');
    expect(JSON.parse(out.output)).toEqual({ result: 0.3, count: 2 });
  });

  it('returns structured errors for invalid JSON, invalid input and unknown tools', async () => {
    const bad = await handleOpenAIToolCall(registry, { name: 'math__sum', arguments: '{oops' });
    expect(JSON.parse(bad.output)).toEqual({ error: { code: 'INVALID_INPUT', message: 'arguments are not valid JSON' } });
    const invalid = await handleOpenAIToolCall(registry, { name: 'math__sum', arguments: '{"values":[]}' });
    expect(JSON.parse(invalid.output)).toMatchObject({ error: { code: 'INVALID_INPUT', field: 'values' } });
    const unknown = await handleOpenAIToolCall(registry, { name: 'math__nope', arguments: '{}' });
    expect(JSON.parse(unknown.output)).toMatchObject({ error: { code: 'TOOL_NOT_FOUND' } });
  });

  it('strips nulls produced by strict mode', async () => {
    const out = await handleOpenAIToolCall(
      registry,
      { name: 'math__round', arguments: '{"value":2.675,"decimals":2,"mode":null}' },
      { strict: true },
    );
    expect(JSON.parse(out.output)).toEqual({ result: 2.68, decimals: 2, mode: 'half_up' });
  });

  it('runs Chat Completions tool_calls', async () => {
    const messages = await runChatToolCalls(registry, [
      { id: 'call_1', type: 'function', function: { name: 'math__percentage_of', arguments: '{"percent":15,"value":80}' } },
      { id: 'call_2', type: 'function', function: { name: 'math__max', arguments: '{"values":[1,9,3]}' } },
    ]);
    expect(messages).toEqual([
      { role: 'tool', tool_call_id: 'call_1', content: '{"result":12}' },
      { role: 'tool', tool_call_id: 'call_2', content: '{"result":9,"index":1}' },
    ]);
  });

  it('runs Responses API function_call items', async () => {
    const outputs = await runResponsesFunctionCalls(registry, [
      { type: 'reasoning' },
      { type: 'function_call', call_id: 'fc_1', name: 'math__power', arguments: '{"base":2,"exponent":8}' } as { type: string },
    ]);
    expect(outputs).toEqual([{ type: 'function_call_output', call_id: 'fc_1', output: '{"result":256}' }]);
  });

  it('builds Agents SDK tools through the provided factory', async () => {
    const factory = vi.fn((def: { name: string; execute: (input: unknown) => Promise<string> }) => def);
    const tools = toAgentsTools(registry, factory, { include: ['math.sum'] });
    expect(factory).toHaveBeenCalledTimes(1);
    expect(tools[0]!.name).toBe('math__sum');
    expect(await tools[0]!.execute({ values: [1, 2, 3] })).toBe('{"result":6,"count":3}');
  });
});
