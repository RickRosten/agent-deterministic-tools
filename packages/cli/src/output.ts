import type { CliEnvironment } from './environment.js';

export interface Printer {
  out(line?: string): void;
  err(line?: string): void;
  json(value: unknown): void;
  color: {
    green(s: string): string;
    yellow(s: string): string;
    red(s: string): string;
    dim(s: string): string;
    bold(s: string): string;
    cyan(s: string): string;
  };
}

export function createPrinter(e: CliEnvironment): Printer {
  const useColor = Boolean(e.stdout.isTTY) && !e.env['NO_COLOR'] && e.env['TERM'] !== 'dumb';
  const wrap = (code: number, reset: number) => (s: string) => (useColor ? `\u001b[${code}m${s}\u001b[${reset}m` : s);
  return {
    out: (line = '') => void e.stdout.write(`${line}\n`),
    err: (line = '') => void e.stderr.write(`${line}\n`),
    json: (value) => void e.stdout.write(`${JSON.stringify(value, null, 2)}\n`),
    color: {
      green: wrap(32, 39),
      yellow: wrap(33, 39),
      red: wrap(31, 39),
      dim: wrap(2, 22),
      bold: wrap(1, 22),
      cyan: wrap(36, 39),
    },
  };
}

export function table(rows: readonly (readonly string[])[]): string[] {
  const widths: number[] = [];
  for (const row of rows) row.forEach((cell, i) => (widths[i] = Math.max(widths[i] ?? 0, cell.length)));
  return rows.map((row) => row.map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i]!))).join('  ').trimEnd());
}
