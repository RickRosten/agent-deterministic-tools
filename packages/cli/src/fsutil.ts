import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export class JsonFileError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = 'JsonFileError';
  }
}

/** Reads a JSON object file. Returns undefined if the file does not exist. */
export function readJsonObject(path: string): Record<string, unknown> | undefined {
  if (!existsSync(path)) return undefined;
  const text = readFileSync(path, 'utf8');
  if (!text.trim()) return {};
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new JsonFileError(path, `${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new JsonFileError(path, `${path} must contain a JSON object`);
  }
  return value as Record<string, unknown>;
}

/** Writes JSON atomically (temp file + rename), optionally keeping a `.bak` copy of the previous file. */
export function writeJsonFile(path: string, value: unknown, options: { backup?: boolean } = {}): { backupPath?: string } {
  mkdirSync(dirname(path), { recursive: true });
  let backupPath: string | undefined;
  if (options.backup && existsSync(path)) {
    backupPath = `${path}.bak`;
    copyFileSync(path, backupPath);
  }
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(tmp, path);
  return backupPath ? { backupPath } : {};
}
