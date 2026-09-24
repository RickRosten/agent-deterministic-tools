export { z } from 'zod';

export {
  ErrorCode,
  ERROR_CODES,
  ToolError,
  RegistryError,
  isToolError,
  invalidInput,
  divisionByZero,
  outOfRange,
  type ToolErrorPayload,
  type ToolErrorOptions,
} from './errors.js';

export {
  defineTool,
  isTool,
  normalizeTool,
  TOOL_NAME_PATTERN,
  type Tool,
  type AnyTool,
  type ToolContext,
  type ToolDefinition,
  type ToolExample,
  type ToolAnnotations,
  type ToolInput,
  type ToolOutput,
} from './tool.js';

export {
  defineModule,
  assertValidModule,
  MODULE_API_VERSION,
  MODULE_ID_PATTERN,
  type Module,
  type ModuleDefinition,
} from './module.js';

export {
  executeTool,
  type ToolResult,
  type ExecuteOptions,
  type ExecutionRecord,
  type ExecutionObserver,
  type ValidationStatus,
} from './execute.js';

export {
  ToolRegistry,
  createRegistry,
  type RegisteredTool,
  type ModuleInfo,
  type ToolRegistryOptions,
  type RegisterModuleOptions,
  type ListOptions,
} from './registry.js';

export {
  describeTool,
  formatToolDescription,
  toJsonSchema,
  type ToolDescriptor,
  type JsonSchema,
  type FormatDescriptionOptions,
} from './describe.js';

export {
  formatIssue,
  formatPath,
  zodErrorToPayload,
  zodErrorToToolError,
  findNonFiniteNumber,
  type ValidationIssue,
} from './validation.js';
