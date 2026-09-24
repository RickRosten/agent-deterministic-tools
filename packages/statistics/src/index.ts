import { defineModule } from '@rickrosten/agent-deterministic-tools-core';
import {
  maxTool,
  meanTool,
  median,
  minTool,
  mode,
  percentile,
  standardDeviation,
  sumTool,
  varianceTool,
} from './tools.js';

export const VERSION = '1.0.0';

export const tools = [meanTool, median, mode, varianceTool, standardDeviation, percentile, minTool, maxTool, sumTool] as const;

export const statisticsModule = defineModule({
  id: 'statistics',
  name: 'Statistics',
  version: VERSION,
  description:
    'Descriptive statistics: mean, median, mode, population/sample variance and standard deviation, percentiles, min, max, sum.',
  tools,
});

export default statisticsModule;

export {
  meanTool as mean,
  median,
  mode,
  varianceTool as variance,
  standardDeviation,
  percentile,
  minTool as min,
  maxTool as max,
  sumTool as sum,
};
export { PERCENTILE_METHODS, VARIANCE_KINDS, type PercentileMethod, type VarianceKind } from './tools.js';
