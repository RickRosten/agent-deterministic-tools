import { z } from '@rickrosten/agent-deterministic-tools-core';

export const MAX_VALUES = 100_000;

export const num = (description: string) => z.number().describe(description);

export const values = z
  .array(z.number())
  .min(1)
  .max(MAX_VALUES)
  .describe(`Non-empty list of finite numbers (max ${MAX_VALUES}).`);
