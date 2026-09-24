import { describe, expect, it } from 'vitest';
import { createRegistry } from '@rickrosten/agent-deterministic-tools-core';
import { BUILTIN_MODULES } from '@rickrosten/agent-deterministic-tools';

const registry = createRegistry(BUILTIN_MODULES);

describe('documented examples', () => {
  const cases = registry.list().flatMap((t) => t.tool.examples.map((ex, i) => ({ name: t.name, i, ex })));

  it('every built-in tool has at least one example', () => {
    const withoutExamples = registry.list().filter((t) => t.tool.examples.length === 0).map((t) => t.name);
    expect(withoutExamples).toEqual([]);
  });

  it.each(cases)('$name example #$i runs and matches its documented output', async ({ name, ex }) => {
    const res = await registry.execute(name, ex.input);
    if (!res.ok) throw new Error(`${name}: ${JSON.stringify(res.error)}`);
    if (ex.output !== undefined) expect(res.data).toMatchObject(ex.output as object);
  });

  it.each(cases)('$name example #$i is deterministic', async ({ name, ex }) => {
    const a = await registry.execute(name, ex.input);
    const b = await registry.execute(name, JSON.parse(JSON.stringify(ex.input)));
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});
