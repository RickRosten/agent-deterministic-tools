import { ErrorCode, ToolError, invalidInput } from '@rickrosten/agent-deterministic-tools-core';

/**
 * Pure proleptic-Gregorian calendar arithmetic on "epoch days" (days since 1970-01-01).
 * No `Date` objects and no host timezone are involved anywhere in this file.
 */

export const MIN_YEAR = 1;
export const MAX_YEAR = 9999;
const MS_PER_DAY = 86_400_000;

export interface CivilDate {
  y: number;
  m: number;
  d: number;
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]!;
}

/** Howard Hinnant's days_from_civil. */
export function daysFromCivil({ y, m, d }: CivilDate): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const mp = (m + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146_097 + doe - 719_468;
}

/** Howard Hinnant's civil_from_days. */
export function civilFromDays(days: number): CivilDate {
  const z = days + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return { y, m, d };
}

export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** ISO weekday: 1 = Monday ... 7 = Sunday. 1970-01-01 was a Thursday. */
export function isoWeekday(epochDay: number): number {
  return ((((epochDay % 7) + 7) % 7) + 3) % 7 + 1;
}

export function weekdayName(epochDay: number): Weekday {
  return WEEKDAYS[isoWeekday(epochDay) - 1]!;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function formatDate({ y, m, d }: CivilDate): string {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

export function formatEpochDay(epochDay: number): string {
  return formatDate(civilFromDays(epochDay));
}

function checkYear(y: number, field: string): void {
  if (y < MIN_YEAR || y > MAX_YEAR) {
    throw new ToolError(ErrorCode.OUT_OF_RANGE, `${field}: year must be between ${MIN_YEAR} and ${MAX_YEAR}`, { field });
  }
}

export function checkEpochDay(epochDay: number, field: string): void {
  checkYear(civilFromDays(epochDay).y, field);
}

// ---------------------------------------------------------------------------
// Time zones (explicit IANA names only, via Intl)
// ---------------------------------------------------------------------------

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      calendar: 'gregory',
      numberingSystem: 'latn',
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

export function assertTimeZone(timeZone: string, field = 'timeZone'): string {
  try {
    return formatter(timeZone).resolvedOptions().timeZone;
  } catch {
    throw invalidInput(`${field} must be a valid IANA time zone such as "Europe/Berlin" or "UTC", received "${timeZone}"`, field);
  }
}

interface LocalDateTime extends CivilDate {
  hh: number;
  mi: number;
  ss: number;
  ms: number;
}

function localMsOf(l: LocalDateTime): number {
  return daysFromCivil(l) * MS_PER_DAY + ((l.hh * 60 + l.mi) * 60 + l.ss) * 1000 + l.ms;
}

function localFromMs(localMs: number): LocalDateTime {
  const day = Math.floor(localMs / MS_PER_DAY);
  let rest = localMs - day * MS_PER_DAY;
  const hh = Math.floor(rest / 3_600_000);
  rest -= hh * 3_600_000;
  const mi = Math.floor(rest / 60_000);
  rest -= mi * 60_000;
  const ss = Math.floor(rest / 1000);
  return { ...civilFromDays(day), hh, mi, ss, ms: rest - ss * 1000 };
}

/** UTC offset in minutes of `timeZone` at the given instant. */
export function zoneOffsetMinutes(epochMs: number, timeZone: string): number {
  const wholeSecond = Math.floor(epochMs / 1000) * 1000;
  const parts: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(wholeSecond)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  const local = localMsOf({
    y: parts['year']!,
    m: parts['month']!,
    d: parts['day']!,
    hh: parts['hour']! % 24,
    mi: parts['minute']!,
    ss: parts['second']!,
    ms: 0,
  });
  return Math.round((local - wholeSecond) / 60_000);
}

/**
 * Converts a wall-clock time in `timeZone` to an instant. Ambiguous times (DST fall-back)
 * resolve to the earlier instant; non-existent times (DST spring-forward gap) are moved
 * forward by the length of the gap. This matches Temporal's "compatible" disambiguation.
 */
export function wallClockToInstant(localMs: number, timeZone: string): number {
  const before = zoneOffsetMinutes(localMs - MS_PER_DAY, timeZone);
  const after = zoneOffsetMinutes(localMs + MS_PER_DAY, timeZone);
  const valid = [...new Set([before, after])]
    .map((off) => localMs - off * 60_000)
    .filter((instant) => instant + zoneOffsetMinutes(instant, timeZone) * 60_000 === localMs)
    .sort((a, b) => a - b);
  return valid[0] ?? localMs - before * 60_000;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export type ParsedInput =
  | { kind: 'date'; epochDay: number }
  | { kind: 'datetime'; epochMs: number; offsetMinutes: number; hasFraction: boolean };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|z|[+-]\d{2}:?\d{2})?$/;

function invalidDate(field: string, message: string): ToolError {
  return new ToolError(ErrorCode.INVALID_DATE, `${field}: ${message}`, { field });
}

function checkCivil(y: number, m: number, d: number, field: string): void {
  checkYear(y, field);
  if (m < 1 || m > 12) throw invalidDate(field, `month ${m} is not between 01 and 12`);
  const dim = daysInMonth(y, m);
  if (d < 1 || d > dim) throw invalidDate(field, `${formatDate({ y, m, d: 1 }).slice(0, 7)} has ${dim} days, day ${d} does not exist`);
}

/**
 * Parses `YYYY-MM-DD` or an ISO 8601 date-time with an explicit offset (`Z`, `+02:00`).
 * Date-times without an offset are rejected: they would require guessing a time zone.
 */
export function parseDateInput(value: string, field: string): ParsedInput {
  const trimmed = value.trim();
  const dm = DATE_RE.exec(trimmed);
  if (dm) {
    const [y, m, d] = [Number(dm[1]), Number(dm[2]), Number(dm[3])];
    checkCivil(y, m, d, field);
    return { kind: 'date', epochDay: daysFromCivil({ y, m, d }) };
  }
  const tm = DATETIME_RE.exec(trimmed);
  if (!tm) {
    throw invalidDate(field, `"${value}" is not a date. Use YYYY-MM-DD or an ISO 8601 date-time with offset such as 2026-03-15T09:30:00+01:00`);
  }
  const [y, m, d, hh, mi] = [Number(tm[1]), Number(tm[2]), Number(tm[3]), Number(tm[4]), Number(tm[5])];
  const ss = tm[6] === undefined ? 0 : Number(tm[6]);
  const ms = tm[7] === undefined ? 0 : Number(tm[7].padEnd(3, '0'));
  checkCivil(y, m, d, field);
  if (hh > 23 || mi > 59 || ss > 59) throw invalidDate(field, `time ${tm[4]}:${tm[5]}:${pad(ss)} is not valid (leap seconds are not supported)`);
  const off = tm[8];
  if (off === undefined) {
    throw invalidDate(
      field,
      'date-time has no UTC offset. Add "Z" or an offset like "+02:00"; the machine time zone is never assumed',
    );
  }
  let offsetMinutes = 0;
  if (off !== 'Z' && off !== 'z') {
    const sign = off[0] === '-' ? -1 : 1;
    const digits = off.slice(1).replace(':', '');
    const oh = Number(digits.slice(0, 2));
    const om = Number(digits.slice(2, 4));
    if (oh > 23 || om > 59) throw invalidDate(field, `offset ${off} is not valid`);
    offsetMinutes = sign * (oh * 60 + om);
  }
  const local = localMsOf({ y, m, d, hh, mi, ss, ms });
  return { kind: 'datetime', epochMs: local - offsetMinutes * 60_000, offsetMinutes, hasFraction: tm[7] !== undefined };
}

export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export function formatInstant(epochMs: number, offsetMinutes: number, withMs: boolean): string {
  const l = localFromMs(epochMs + offsetMinutes * 60_000);
  const frac = withMs || l.ms !== 0 ? `.${pad(l.ms, 3)}` : '';
  return `${formatDate(l)}T${pad(l.hh)}:${pad(l.mi)}:${pad(l.ss)}${frac}${formatOffset(offsetMinutes)}`;
}

/**
 * Calendar day of the input: plain dates as-is; date-times in `timeZone` when given,
 * otherwise in the offset written in the input itself.
 */
export function epochDayOf(parsed: ParsedInput, timeZone: string | undefined): number {
  if (parsed.kind === 'date') return parsed.epochDay;
  const offset = timeZone ? zoneOffsetMinutes(parsed.epochMs, timeZone) : parsed.offsetMinutes;
  return Math.floor((parsed.epochMs + offset * 60_000) / MS_PER_DAY);
}

/** Adds calendar days to a date-time, preserving wall-clock time. */
export function addDaysToInstant(
  parsed: Extract<ParsedInput, { kind: 'datetime' }>,
  days: number,
  timeZone: string | undefined,
): { epochMs: number; offsetMinutes: number } {
  if (!timeZone) {
    return { epochMs: parsed.epochMs + days * MS_PER_DAY, offsetMinutes: parsed.offsetMinutes };
  }
  const offset = zoneOffsetMinutes(parsed.epochMs, timeZone);
  const localMs = parsed.epochMs + offset * 60_000 + days * MS_PER_DAY;
  const epochMs = wallClockToInstant(localMs, timeZone);
  return { epochMs, offsetMinutes: zoneOffsetMinutes(epochMs, timeZone) };
}

/** Calendar difference (years, months, days) from a to b, with end-of-month clamping. */
export function calendarDifference(a: number, b: number): { years: number; months: number; days: number } {
  if (b < a) {
    const r = calendarDifference(b, a);
    return { years: -r.years || 0, months: -r.months || 0, days: -r.days || 0 };
  }
  const start = civilFromDays(a);
  const end = civilFromDays(b);
  let months = (end.y - start.y) * 12 + (end.m - start.m);
  const shifted = (n: number) => {
    const total = start.y * 12 + (start.m - 1) + n;
    const y = Math.floor(total / 12);
    const m = (total % 12) + 1;
    return daysFromCivil({ y, m, d: Math.min(start.d, daysInMonth(y, m)) });
  };
  if (shifted(months) > b) months -= 1;
  const days = b - shifted(months);
  return { years: Math.trunc(months / 12), months: months % 12, days };
}
