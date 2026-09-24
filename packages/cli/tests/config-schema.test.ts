import { describe, expect, it } from 'vitest';
import { CONFIG_SCHEMA_URL, configJsonSchema, ConfigSchema } from '@rickrosten/agent-deterministic-tools';

describe('config.schema.json', () => {
  it('is published inside the package and referenced by $schema', () => {
    expect(CONFIG_SCHEMA_URL).toBe('https://unpkg.com/@rickrosten/agent-deterministic-tools@1/config.schema.json');
  });

  it('matches the zod configuration schema (regenerate with `npm run schemas:update`)', async () => {
    await expect(`${JSON.stringify(configJsonSchema(), null, 2)}\n`).toMatchFileSnapshot('../config.schema.json');
  });

  it('describes a strict object that accepts the files written by the CLI', () => {
    const schema = configJsonSchema();
    expect(schema).toMatchObject({ type: 'object', additionalProperties: false, $id: CONFIG_SCHEMA_URL });
    expect(ConfigSchema.safeParse({ $schema: CONFIG_SCHEMA_URL, modules: ['math'] }).success).toBe(true);
  });
});
