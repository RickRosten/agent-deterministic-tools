import { describe, expect, it, vi } from 'vitest';
import {
  createRegistry,
  defineModule,
  defineTool,
  ErrorCode,
  executeTool,
  formatToolDescription,
  RegistryError,
  ToolError,
  ToolRegistry,
  z,
  type ExecutionRecord,
  type Module,
} from '@rickrosten/agent-deterministic-tools-core';

const percentageChange = defineTool({
  name: 'percentage_change',
  description: 'Calculates percentage change.',
  whenToUse: 'the user asks how much a value grew or shrank in percent',
  whenNotToUse: ['the user asks for a percentage of a value'],
  limitations: 'oldValue must be non-zero',
  examples: [{ input: { oldValue: 50, newValue: 75 } }],
  input: z.strictObject({ oldValue: z.number(), newValue: z.number() }),
  output: z.object({ percentage: z.number() }),
  execute({ oldValue, newValue }) {
    if (oldValue === 0) throw new ToolError(ErrorCode.DIVISION_BY_ZERO, 'oldValue must not be 0', { field: 'oldValue' });
    return { percentage: ((newValue - oldValue) / oldValue) * 100 };
  },
});

const asyncTool = defineTool({
  name: 'async_echo',
  description: 'Echoes asynchronously.',
  input: z.strictObject({ text: z.string().min(1) }),
  output: z.object({ text: z.string() }),
  execute: async ({ text }) => ({ text }),
});

const demo = (): Module =>
  defineModule({
    id: 'demo',
    name: 'Demo',
    version: '1.0.0',
    description: 'Demo tools',
    tools: [percentageChange, asyncTool],
  });

describe('defineTool', () => {
  it('normalizes metadata and freezes the tool', () => {
    expect(percentageChange.whenToUse).toEqual(['the user asks how much a value grew or shrank in percent']);
    expect(percentageChange.limitations).toEqual(['oldValue must be non-zero']);
    expect(percentageChange.annotations.readOnlyHint).toBe(true);
    expect(Object.isFrozen(percentageChange)).toBe(true);
  });

  it('rejects invalid names', () => {
    const bad = () =>
      defineTool({
        name: 'Bad.Name',
        description: 'x',
        input: z.object({}),
        output: z.object({}),
        execute: () => ({}),
      });
    expect(bad).toThrow(RegistryError);
  });
});

describe('defineModule', () => {
  it('rejects duplicate tool names', () => {
    expect(() =>
      defineModule({ id: 'x', name: 'X', version: '1.0.0', description: 'x', tools: [asyncTool, asyncTool] }),
    ).toThrow(/more than once/);
  });

  it('rejects non-semver versions and bad ids', () => {
    expect(() => defineModule({ id: 'x', name: 'X', version: '1.0', description: 'x', tools: [] })).toThrow(/semantic/);
    expect(() => defineModule({ id: 'X!', name: 'X', version: '1.0.0', description: 'x', tools: [] })).toThrow(/module id/);
  });

  it('rejects unsupported module API versions', () => {
    expect(() =>
      defineModule({ id: 'x', name: 'X', version: '1.0.0', description: 'x', tools: [], apiVersion: 2 }),
    ).toThrow(/module API v2/);
  });
});

describe('executeTool', () => {
  it('returns structured data on success', async () => {
    await expect(executeTool(percentageChange, { oldValue: 50, newValue: 75 })).resolves.toEqual({
      ok: true,
      data: { percentage: 50 },
    });
  });

  it('supports async execute', async () => {
    await expect(executeTool(asyncTool, { text: 'hi' })).resolves.toEqual({ ok: true, data: { text: 'hi' } });
  });

  it('reports missing fields', async () => {
    const res = await executeTool(percentageChange, { oldValue: 1 });
    expect(res).toEqual({
      ok: false,
      error: { code: 'INVALID_INPUT', message: 'newValue is required (expected number)', field: 'newValue' },
    });
  });

  it('reports wrong types', async () => {
    const res = await executeTool(percentageChange, { oldValue: '1', newValue: 2 });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.field).toBe('oldValue');
      expect(res.error.message).toBe('oldValue must be number, received string');
    }
  });

  it('reports unknown fields for strict schemas', async () => {
    const res = await executeTool(percentageChange, { oldValue: 1, newValue: 2, extra: true });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('INVALID_INPUT');
      expect(res.error.field).toBe('extra');
    }
  });

  it('formats bounds like the spec', async () => {
    const tool = defineTool({
      name: 'bounded',
      description: 'x',
      input: z.strictObject({ annualRate: z.number().min(0), values: z.array(z.number()).min(1) }),
      output: z.object({}),
      execute: () => ({}),
    });
    const res = await executeTool(tool, { annualRate: -1, values: [] });
    expect(res).toMatchObject({
      ok: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'annualRate must be greater than or equal to 0',
        field: 'annualRate',
        details: { issues: [{}, { field: 'values', message: 'values must contain at least 1 item' }] },
      },
    });
  });

  it('passes through ToolError', async () => {
    const res = await executeTool(percentageChange, { oldValue: 0, newValue: 2 });
    expect(res).toEqual({
      ok: false,
      error: { code: 'DIVISION_BY_ZERO', message: 'oldValue must not be 0', field: 'oldValue' },
    });
  });

  it('hides unexpected errors and stack traces', async () => {
    const tool = defineTool({
      name: 'boom',
      description: 'x',
      input: z.object({}),
      output: z.object({}),
      execute: () => {
        throw new Error('secret internals at /home/user/file.ts:12');
      },
    });
    const res = await executeTool(tool, {});
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('INTERNAL_ERROR');
      expect(JSON.stringify(res.error)).not.toContain('secret');
      expect(JSON.stringify(res.error)).not.toContain('file.ts');
    }
  });

  it('converts non-finite results into OUT_OF_RANGE', async () => {
    const tool = defineTool({
      name: 'overflow',
      description: 'x',
      input: z.object({}),
      output: z.object({ value: z.number() }),
      execute: () => ({ value: Number.MAX_VALUE * 10 }),
    });
    await expect(executeTool(tool, {})).resolves.toMatchObject({ ok: false, error: { code: 'OUT_OF_RANGE', field: 'value' } });
  });

  it('treats output schema violations as internal errors', async () => {
    const tool = defineTool({
      name: 'liar',
      description: 'x',
      input: z.object({}),
      output: z.object({ value: z.number() }),
      execute: () => ({ value: 'nope' }) as unknown as { value: number },
    });
    await expect(executeTool(tool, {})).resolves.toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } });
  });

  it('emits execution records without input values by default', async () => {
    const records: ExecutionRecord[] = [];
    await executeTool(percentageChange, { oldValue: 50, newValue: 75 }, { observer: (r) => records.push(r) });
    await executeTool(percentageChange, { oldValue: 'x' }, { observer: (r) => records.push(r) });
    expect(records[0]).toMatchObject({
      tool: 'percentage_change',
      inputValidation: 'passed',
      outputValidation: 'passed',
      status: 'success',
      inputFields: ['oldValue', 'newValue'],
    });
    expect(records[0]).not.toHaveProperty('input');
    expect(records[0]!.durationMs).toBeGreaterThanOrEqual(0);
    expect(records[1]).toMatchObject({ inputValidation: 'failed', status: 'error', errorCode: 'INVALID_INPUT' });
  });

  it('includes inputs only when logInputs is enabled', async () => {
    const observer = vi.fn();
    await executeTool(asyncTool, { text: 'x' }, { observer, logInputs: true });
    expect(observer.mock.calls[0]![0]).toMatchObject({ input: { text: 'x' } });
  });

  it('is not affected by throwing observers', async () => {
    const res = await executeTool(asyncTool, { text: 'x' }, {
      observer: () => {
        throw new Error('observer failure');
      },
    });
    expect(res.ok).toBe(true);
  });
});

describe('ToolRegistry', () => {
  it('namespaces tools by module id', () => {
    const registry = createRegistry([demo()]);
    expect(registry.list().map((t) => t.name)).toEqual(['demo.percentage_change', 'demo.async_echo']);
    expect(registry.get('demo.async_echo')?.moduleId).toBe('demo');
  });

  it('detects module id conflicts', () => {
    const registry = createRegistry([demo()]);
    expect(() => registry.register(demo())).toThrow(RegistryError);
  });

  it('rejects invalid third-party module objects', () => {
    const registry = new ToolRegistry();
    expect(() => registry.register({ id: 'bad', name: 'Bad', version: '1.0.0', description: 'x', tools: [{}] } as never)).toThrow(
      /not a tool/,
    );
  });

  it('enables and disables modules and tools', async () => {
    const registry = createRegistry([demo()]);
    registry.disableTool('demo.async_echo');
    expect(registry.list().map((t) => t.name)).toEqual(['demo.percentage_change']);
    expect(registry.list({ includeDisabled: true })).toHaveLength(2);

    registry.disableModule('demo');
    expect(registry.list()).toHaveLength(0);
    const res = await registry.execute('demo.percentage_change', { oldValue: 1, newValue: 2 });
    expect(res).toMatchObject({ ok: false, error: { code: 'TOOL_NOT_FOUND' } });

    registry.enableModule('demo').enableTool('demo.async_echo');
    expect(registry.list()).toHaveLength(2);
  });

  it('setEnabledModules keeps only listed modules', () => {
    const other = defineModule({ id: 'other', name: 'Other', version: '0.1.0', description: 'o', tools: [asyncTool] });
    const registry = createRegistry([demo(), other]).setEnabledModules(['other']);
    expect(registry.list().map((t) => t.name)).toEqual(['other.async_echo']);
    expect(() => registry.setEnabledModules(['missing'])).toThrow(/Unknown module/);
  });

  it('can register modules disabled', () => {
    const registry = new ToolRegistry().register(demo(), { enabled: false });
    expect(registry.list()).toHaveLength(0);
    expect(registry.listModules()[0]).toMatchObject({ id: 'demo', enabled: false, toolCount: 2 });
  });

  it('executes tools and notifies observers', async () => {
    const records: ExecutionRecord[] = [];
    const registry = createRegistry([demo()], { observer: (r) => records.push(r) });
    const off = registry.onExecution((r) => records.push(r));
    const res = await registry.execute('demo.percentage_change', { oldValue: 100, newValue: 50 });
    expect(res).toEqual({ ok: true, data: { percentage: -50 } });
    expect(records).toHaveLength(2);
    expect(records[0]!.tool).toBe('demo.percentage_change');
    off();
    await registry.execute('demo.percentage_change', { oldValue: 100, newValue: 50 });
    expect(records).toHaveLength(3);
  });

  it('returns TOOL_NOT_FOUND for unknown tools', async () => {
    const registry = createRegistry([demo()]);
    const res = await registry.execute('demo.nope', {});
    expect(res).toMatchObject({ ok: false, error: { code: 'TOOL_NOT_FOUND' } });
  });

  it('describes tools with JSON schemas', () => {
    const registry = createRegistry([demo()]);
    const d = registry.describe('demo.percentage_change');
    expect(d).toMatchObject({
      name: 'demo.percentage_change',
      moduleId: 'demo',
      moduleVersion: '1.0.0',
      title: 'Percentage Change',
      inputSchema: {
        type: 'object',
        properties: { oldValue: { type: 'number' }, newValue: { type: 'number' } },
        required: ['oldValue', 'newValue'],
        additionalProperties: false,
      },
      outputSchema: { type: 'object' },
    });
    expect(d.inputSchema).not.toHaveProperty('$schema');
    const text = formatToolDescription(d);
    expect(text).toContain('Use when: the user asks how much');
    expect(text).toContain('Do not use when: the user asks for a percentage of a value');
    expect(text).toContain('Limitations: oldValue must be non-zero');
    expect(text).toContain('Example input: {"oldValue":50,"newValue":75}');
  });
});
