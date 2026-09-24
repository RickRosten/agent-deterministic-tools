// Responses API: the model decides which deterministic tool to call, we execute it locally.
import OpenAI from 'openai';
import { createRegistry } from '@rickrosten/agent-deterministic-tools-core';
import { financeModule } from '@rickrosten/agent-deterministic-tools-finance';
import { mathModule } from '@rickrosten/agent-deterministic-tools-math';
import { runResponsesFunctionCalls, toResponsesTools } from '@rickrosten/agent-deterministic-tools-openai';

const registry = createRegistry([mathModule, financeModule]);
const client = new OpenAI();
const tools = toResponsesTools(registry);

let input = [
  { role: 'user', content: 'Monthly payment on a 250,000 EUR mortgage at 4.2% nominal, compounded monthly, 25 years, paid at month end?' },
];

for (let turn = 0; turn < 5; turn++) {
  const response = await client.responses.create({ model: 'gpt-5', input, tools });
  const outputs = await runResponsesFunctionCalls(registry, response.output);
  if (outputs.length === 0) {
    console.log(response.output_text);
    break;
  }
  input = [...input, ...response.output, ...outputs];
}
