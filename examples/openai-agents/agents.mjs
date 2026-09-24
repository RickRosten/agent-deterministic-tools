// OpenAI Agents SDK: deterministic tools as function tools of an agent.
import { Agent, run, tool } from '@openai/agents';
import { createRegistry } from '@rickrosten/agent-deterministic-tools-core';
import { financeModule } from '@rickrosten/agent-deterministic-tools-finance';
import { mathModule } from '@rickrosten/agent-deterministic-tools-math';
import { toAgentsTools } from '@rickrosten/agent-deterministic-tools-openai';

const registry = createRegistry([mathModule, financeModule]);

const agent = new Agent({
  name: 'Calculator',
  instructions: 'Never compute numbers yourself. Always call a deterministic tool and report its exact result.',
  tools: toAgentsTools(registry, tool),
});

const result = await run(agent, 'I invest 10,000 at 5% nominal compounded monthly for 10 years. Final amount?');
console.log(result.finalOutput);
