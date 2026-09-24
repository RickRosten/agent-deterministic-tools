// Chat Completions: classic function calling loop.
import OpenAI from 'openai';
import { createRegistry } from '@rickrosten/agent-deterministic-tools-core';
import { mathModule } from '@rickrosten/agent-deterministic-tools-math';
import { runChatToolCalls, toChatCompletionsTools } from '@rickrosten/agent-deterministic-tools-openai';

const registry = createRegistry([mathModule]);
const client = new OpenAI();
const tools = toChatCompletionsTools(registry);

const messages = [{ role: 'user', content: 'Revenue went from 1.2M to 1.53M. What is the growth in percent?' }];

for (let turn = 0; turn < 5; turn++) {
  const completion = await client.chat.completions.create({ model: 'gpt-4.1', messages, tools });
  const message = completion.choices[0].message;
  messages.push(message);
  if (!message.tool_calls?.length) {
    console.log(message.content);
    break;
  }
  messages.push(...(await runChatToolCalls(registry, message.tool_calls)));
}
