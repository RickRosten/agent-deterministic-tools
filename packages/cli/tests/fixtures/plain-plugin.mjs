// A third-party module written without any helper from @rickrosten/agent-deterministic-tools-core.
import { z } from 'zod';

export default {
  id: 'plain',
  name: 'Plain plugin',
  version: '0.1.0',
  description: 'Fixture module built from plain objects.',
  tools: [
    {
      name: 'double',
      description: 'Doubles a number.',
      inputSchema: z.strictObject({ value: z.number() }),
      outputSchema: z.object({ result: z.number() }),
      examples: [{ input: { value: 2 } }],
      execute: ({ value }) => ({ result: value * 2 }),
    },
  ],
};
