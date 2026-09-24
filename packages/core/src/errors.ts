/**
 * Machine-readable error codes. Agents should branch on `code`, never on `message`.
 */
export const ErrorCode = {
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_UNIT: 'INVALID_UNIT',
  INVALID_DATE: 'INVALID_DATE',
  UNSUPPORTED_OPERATION: 'UNSUPPORTED_OPERATION',
  DIVISION_BY_ZERO: 'DIVISION_BY_ZERO',
  OUT_OF_RANGE: 'OUT_OF_RANGE',
  PRECISION_ERROR: 'PRECISION_ERROR',
  TOOL_NOT_FOUND: 'TOOL_NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ERROR_CODES: readonly ErrorCode[] = Object.freeze(Object.values(ErrorCode));

/** Serializable error shape returned to agents. Never contains stack traces. */
export interface ToolErrorPayload {
  code: ErrorCode;
  message: string;
  field?: string;
  details?: Record<string, unknown>;
}

export interface ToolErrorOptions {
  field?: string | undefined;
  details?: Record<string, unknown> | undefined;
}

/**
 * Throw from `execute` to return a structured, agent-readable error.
 */
export class ToolError extends Error {
  readonly code: ErrorCode;
  readonly field: string | undefined;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, message: string, options: ToolErrorOptions = {}) {
    super(message);
    this.name = 'ToolError';
    this.code = code;
    this.field = options.field;
    this.details = options.details;
  }

  toJSON(): ToolErrorPayload {
    const payload: ToolErrorPayload = { code: this.code, message: this.message };
    if (this.field !== undefined) payload.field = this.field;
    if (this.details !== undefined) payload.details = this.details;
    return payload;
  }
}

export function isToolError(value: unknown): value is ToolError {
  return value instanceof ToolError;
}

export function invalidInput(message: string, field?: string, details?: Record<string, unknown>): ToolError {
  return new ToolError(ErrorCode.INVALID_INPUT, message, { field, details });
}

export function divisionByZero(message: string, field?: string): ToolError {
  return new ToolError(ErrorCode.DIVISION_BY_ZERO, message, { field });
}

export function outOfRange(message: string, field?: string, details?: Record<string, unknown>): ToolError {
  return new ToolError(ErrorCode.OUT_OF_RANGE, message, { field, details });
}

/**
 * Error thrown by the registry for programmer mistakes (name conflicts, invalid modules).
 * These are configuration errors and are never produced by tool execution.
 */
export class RegistryError extends Error {
  readonly code: 'NAME_CONFLICT' | 'INVALID_MODULE' | 'INVALID_TOOL' | 'UNKNOWN_MODULE' | 'UNKNOWN_TOOL';

  constructor(code: RegistryError['code'], message: string) {
    super(message);
    this.name = 'RegistryError';
    this.code = code;
  }
}
