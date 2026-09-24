import { defineModule } from '@rickrosten/agent-deterministic-tools-core';
import { dilution, molarMass, molarity } from './tools.js';

export const chemistryModule = defineModule({
  id: 'chemistry',
  name: 'Chemistry (Acme)',
  version: '1.0.0',
  description: 'Example third-party module: molar mass, molarity and dilution calculations.',
  homepage: 'https://github.com/RickRosten/agent-deterministic-tools/tree/main/examples/acme-chemistry',
  tools: [molarMass, molarity, dilution],
});

export default chemistryModule;
export { molarMass, molarity, dilution };
export { parseFormula } from './formula.js';
