import { ErrorCode, isToolError, type ToolErrorPayload } from './errors.js';
import type { AnyTool, ToolContext } from './tool.js';
import { findNonFiniteNumber, zodErrorToPayload } from './validation.js';

export type ToolResult<O = unknown> = { ok: true; data: O } | { ok: false; error: ToolErrorPayload };

export type ValidationStatus = 'passed' | 'failed' | 'skipped';

/**
 * Internal execution record. Input values are omitted unless `logInputs` is enabled,
 * only the top-level field names are recorded.
 */
export interface ExecutionRecord {
  tool: string;
  requestId?: string;
  inputValidation: ValidationStatus;
  outputValidation: ValidationStatus;
  status: 'success' | 'error';
  errorCode?: ErrorCode;
  durationMs: number;
  inputFields: string[];
  input?: unknown;
}

export type ExecutionObserver = (record: ExecutionRecord) => void;

export interface ExecuteOptions {
  toolName?: string;
  requestId?: string;
  signal?: AbortSignal;
  observer?: ExecutionObserver;
  /** Include raw input values in execution records. Off by default: inputs may be sensitive. */
  logInputs?: boolean;
}

const INTERNAL_MESSAGE = 'The tool failed unexpectedly. This is a bug in the tool, not in your input.';

function inputFields(input: unknown): string[] {
  return input !== null && typeof input === 'object' && !Array.isArray(input) ? Object.keys(input) : [];
}

/**
 * Validates input, runs the tool, validates output and converts every failure into a
 * structured error. Never throws and never exposes stack traces.
 */
export async function executeTool<O = unknown>(
  tool: AnyTool,
  rawInput: unknown,
  options: ExecuteOptions = {},
): Promise<ToolResult<O>> {
  const start = performance.now();
  const toolName = options.toolName ?? tool.name;
  let inputValidation: ValidationStatus = 'skipped';
  let outputValidation: ValidationStatus = 'skipped';

  const finish = (result: ToolResult<O>): ToolResult<O> => {
    if (options.observer) {
      const record: ExecutionRecord = {
        tool: toolName,
        inputValidation,
        outputValidation,
        status: result.ok ? 'success' : 'error',
        durationMs: Math.round((performance.now() - start) * 1000) / 1000,
        inputFields: inputFields(rawInput),
      };
      if (options.requestId !== undefined) record.requestId = options.requestId;
      if (!result.ok) record.errorCode = result.error.code;
      if (options.logInputs) record.input = rawInput;
      try {
        options.observer(record);
      } catch {
        // Observers must never influence tool results.
      }
    }
    return result;
  };

  const parsedInput = tool.inputSchema.safeParse(rawInput ?? {});
  if (!parsedInput.success) {
    inputValidation = 'failed';
    return finish({ ok: false, error: zodErrorToPayload(parsedInput.error, rawInput) });
  }
  inputValidation = 'passed';

  const context: ToolContext = { toolName, requestId: options.requestId, signal: options.signal };

  let output: unknown;
  try {
    output = await tool.execute(parsedInput.data, context);
  } catch (error) {
    if (isToolError(error)) return finish({ ok: false, error: error.toJSON() });
    return finish({ ok: false, error: { code: ErrorCode.INTERNAL_ERROR, message: INTERNAL_MESSAGE } });
  }

  const nonFinite = findNonFiniteNumber(output);
  if (nonFinite !== undefined) {
    outputValidation = 'failed';
    return finish({
      ok: false,
      error: {
        code: ErrorCode.OUT_OF_RANGE,
        message: `The result is not a finite number (overflow or undefined operation) at "${nonFinite}". Use smaller inputs.`,
        field: nonFinite,
      },
    });
  }

  const parsedOutput = tool.outputSchema.safeParse(output);
  if (!parsedOutput.success) {
    outputValidation = 'failed';
    return finish({ ok: false, error: { code: ErrorCode.INTERNAL_ERROR, message: INTERNAL_MESSAGE } });
  }
  outputValidation = 'passed';
  return finish({ ok: true, data: parsedOutput.data as O });
}
