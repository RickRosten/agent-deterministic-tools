import { defineModule } from '@rickrosten/agent-deterministic-tools-core';
import { average, max, min, sum, weightedAverage } from './tools/aggregates.js';
import { power, root, round } from './tools/arithmetic.js';
import { percentage, percentageChange, percentageOf } from './tools/percentages.js';
import { proportion, ratio } from './tools/ratios.js';

export const VERSION = '1.0.0';

export const tools = [
  percentage,
  percentageOf,
  percentageChange,
  ratio,
  proportion,
  average,
  weightedAverage,
  sum,
  min,
  max,
  round,
  power,
  root,
] as const;

export const mathModule = defineModule({
  id: 'math',
  name: 'Math',
  version: VERSION,
  description: 'Percentages, ratios, proportions, averages, sums, min/max, rounding, powers and roots.',
  tools,
});

export default mathModule;

export {
  percentage,
  percentageOf,
  percentageChange,
  ratio,
  proportion,
  average,
  weightedAverage,
  sum,
  min,
  max,
  round,
  power,
  root,
};
