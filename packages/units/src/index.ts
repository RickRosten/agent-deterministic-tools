import { defineModule } from '@rickrosten/agent-deterministic-tools-core';
import { convert, listUnits } from './tools.js';

export const VERSION = '1.0.0';

export const tools = [convert, listUnits] as const;

export const unitsModule = defineModule({
  id: 'units',
  name: 'Units',
  version: VERSION,
  description:
    'Exact unit conversion for length, mass, temperature, area, volume, speed, time, energy, power, pressure and data, with aliases and explicit handling of ambiguous symbols.',
  tools,
});

export default unitsModule;

export { convert, listUnits };
export { CATEGORIES, BASE_UNITS, UNITS, AMBIGUOUS, type Category, type UnitDef } from './catalog.js';
export { normalizeUnit, resolveUnit } from './resolve.js';
