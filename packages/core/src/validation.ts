import type { z } from 'zod';
import { ErrorCode, ToolError, type ToolErrorPayload } from './errors.js';

/** Formats a zod path as `a.b[2].c`. */
export function formatPath(path: readonly PropertyKey[]): string {
  let out = '';
  for (const part of path) {
    if (typeof part === 'number') out += `[${part}]`;
    else out += out ? `.${String(part)}` : String(part);
  }
  return out;
}

function valueAt(input: unknown, path: readonly PropertyKey[]): unknown {
  let current: unknown = input;
  for (const part of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<PropertyKey, unknown>)[part];
  }
  return current;
}

function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number' && Number.isNaN(value)) return 'NaN';
  if (typeof value === 'number' && !Number.isFinite(value)) return 'Infinity';
  return typeof value;
}

function boundKind(origin: string, count: string): string {
  const plural = count === '1' ? '' : 's';
  switch (origin) {
    case 'array':
    case 'set':
      return `item${plural}`;
    case 'string':
      return `character${plural}`;
    default:
      return '';
  }
}

export interface ValidationIssue {
  field: string;
  message: string;
}

/** Converts a single zod issue into a short, agent-oriented message. */
export function formatIssue(issue: z.core.$ZodIssue, rawInput: unknown): ValidationIssue {
  const field = formatPath(issue.path);
  const subject = field || 'input';
  switch (issue.code) {
    case 'invalid_type': {
      const actual = valueAt(rawInput, issue.path);
      if (actual === undefined) return { field, message: `${subject} is required (expected ${issue.expected})` };
      return { field, message: `${subject} must be ${issue.expected}, received ${describeType(actual)}` };
    }
    case 'too_small': {
      const min = String(issue.minimum);
      const unit = boundKind(issue.origin, min);
      if (unit) return { field, message: `${subject} must contain at least ${min} ${unit}` };
      return {
        field,
        message: `${subject} must be greater than ${issue.inclusive ? 'or equal to ' : ''}${min}`,
      };
    }
    case 'too_big': {
      const max = String(issue.maximum);
      const unit = boundKind(issue.origin, max);
      if (unit) return { field, message: `${subject} must contain at most ${max} ${unit}` };
      return { field, message: `${subject} must be less than ${issue.inclusive ? 'or equal to ' : ''}${max}` };
    }
    case 'invalid_value':
      return {
        field,
        message: `${subject} must be one of: ${issue.values.map((v) => JSON.stringify(v)).join(', ')}`,
      };
    case 'invalid_format':
      if (issue.message && !issue.message.startsWith('Invalid')) return { field, message: `${subject}: ${issue.message}` };
      return { field, message: `${subject} must be a valid ${issue.format}` };
    case 'not_multiple_of':
      return { field, message: `${subject} must be a multiple of ${String(issue.divisor)}` };
    case 'unrecognized_keys': {
      const key = issue.keys[0] ?? '';
      const unknownField = field ? `${field}.${key}` : key;
      return {
        field: unknownField,
        message: `Unknown field${issue.keys.length > 1 ? 's' : ''}: ${issue.keys.join(', ')}. Check the input schema for the exact parameter names.`,
      };
    }
    case 'invalid_union':
      return { field, message: `${subject} does not match any accepted form` };
    case 'custom':
      return { field, message: issue.message };
    default:
      return { field, message: `${subject}: ${issue.message}` };
  }
}

const MAX_REPORTED_ISSUES = 10;

/** Converts a zod error into a structured `INVALID_INPUT` payload. */
export function zodErrorToPayload(error: z.ZodError, rawInput: unknown): ToolErrorPayload {
  const issues = error.issues.slice(0, MAX_REPORTED_ISSUES).map((issue) => formatIssue(issue, rawInput));
  const first = issues[0] ?? { field: '', message: 'input is invalid' };
  const payload: ToolErrorPayload = { code: ErrorCode.INVALID_INPUT, message: first.message };
  if (first.field) payload.field = first.field;
  if (issues.length > 1) payload.details = { issues };
  return payload;
}

export function zodErrorToToolError(error: z.ZodError, rawInput: unknown): ToolError {
  const payload = zodErrorToPayload(error, rawInput);
  return new ToolError(payload.code, payload.message, { field: payload.field, details: payload.details });
}

/** Returns the path of the first non-finite number found in `value`, or undefined. */
export function findNonFiniteNumber(value: unknown, path = ''): string | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? undefined : path || 'result';
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = findNonFiniteNumber(value[i], `${path}[${i}]`);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      const found = findNonFiniteNumber(v, path ? `${path}.${key}` : key);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}
