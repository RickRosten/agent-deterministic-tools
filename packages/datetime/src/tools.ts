import { defineTool, invalidInput, z } from '@rickrosten/agent-deterministic-tools-core';
import {
  addDaysToInstant,
  assertTimeZone,
  calendarDifference,
  checkEpochDay,
  daysFromCivil,
  daysInMonth,
  epochDayOf,
  formatEpochDay,
  formatInstant,
  isLeapYear,
  isoWeekday,
  MAX_YEAR,
  MIN_YEAR,
  parseDateInput,
  weekdayName,
  WEEKDAYS,
  type ParsedInput,
  type Weekday,
} from './calendar.js';

const NO_NOW = 'there is no implicit "today": pass the current date explicitly if needed';
const NO_HOST_TZ = 'the machine time zone is never used; date-times must carry an offset (Z, +02:00) and IANA time zones must be given explicitly';

const dateInput = (description: string) =>
  z
    .string()
    .min(10)
    .max(40)
    .describe(`${description} Format YYYY-MM-DD, or ISO 8601 date-time with offset (2026-03-15T09:30:00+01:00 / ...Z).`);

const timeZone = z
  .string()
  .min(1)
  .max(64)
  .optional()
  .describe('Optional IANA time zone (e.g. "Europe/Berlin"). Used to interpret date-time inputs as local wall-clock time.');

const weekend = z
  .array(z.enum(WEEKDAYS))
  .max(6)
  .default(['saturday', 'sunday'])
  .describe('Non-working weekdays. Default ["saturday", "sunday"]. Use ["friday", "saturday"] for many Middle-East calendars.');

const holidays = z
  .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date in YYYY-MM-DD format'))
  .max(10_000)
  .default([])
  .describe('Public holidays as YYYY-MM-DD. Holiday calendars are not built in: pass them explicitly.');

const dayOfWeekOutput = z.enum(WEEKDAYS);

function tz(value: string | undefined): string | undefined {
  return value === undefined ? undefined : assertTimeZone(value);
}

function toDay(value: string, field: string, zone: string | undefined): { parsed: ParsedInput; day: number } {
  const parsed = parseDateInput(value, field);
  return { parsed, day: epochDayOf(parsed, zone) };
}

interface BusinessCalendar {
  weekend: ReadonlySet<number>;
  holidays: ReadonlySet<number>;
}

function businessCalendar(weekendDays: readonly Weekday[], holidayList: readonly string[]): BusinessCalendar {
  const weekendSet = new Set(weekendDays.map((w) => WEEKDAYS.indexOf(w) + 1));
  const holidaySet = new Set(holidayList.map((h, i) => {
    const p = parseDateInput(h, `holidays[${i}]`);
    return p.kind === 'date' ? p.epochDay : 0;
  }));
  return { weekend: weekendSet, holidays: holidaySet };
}

function isBusiness(day: number, cal: BusinessCalendar): boolean {
  return !cal.weekend.has(isoWeekday(day)) && !cal.holidays.has(day);
}

/** Counts business days in the inclusive range [a, b] (a <= b). */
function countBusinessDays(a: number, b: number, cal: BusinessCalendar): number {
  const length = b - a + 1;
  const fullWeeks = Math.floor(length / 7);
  let count = fullWeeks * (7 - cal.weekend.size);
  for (let d = a + fullWeeks * 7; d <= b; d++) if (!cal.weekend.has(isoWeekday(d))) count++;
  for (const h of cal.holidays) if (h >= a && h <= b && !cal.weekend.has(isoWeekday(h))) count--;
  return count;
}

export const dateDifference = defineTool({
  name: 'date_difference',
  title: 'Difference between two dates',
  description:
    'Difference from `start` to `end` in calendar days and weeks, as a years/months/days breakdown, and (for two date-times) exact elapsed time.',
  whenToUse: ['"how many days between 2026-01-15 and 2026-03-01?"', 'age or tenure in years, months and days', 'elapsed hours between two timestamps'],
  whenNotToUse: ['working days only (use datetime.business_days_between)'],
  limitations: [
    'result is negative when end is before start',
    'days counts calendar-date boundaries: end date minus start date (the start day is not counted)',
    'years/months/days breakdown adds whole months from start with end-of-month clamping (Jan 31 + 1 month = Feb 28/29)',
    NO_HOST_TZ,
    NO_NOW,
  ],
  examples: [{ input: { start: '2024-01-31', end: '2025-03-01' }, output: { days: 395, weeks: 56.428571, calendar: { years: 1, months: 1, days: 1 } } }],
  input: z.strictObject({ start: dateInput('Start date.'), end: dateInput('End date.'), timeZone }),
  output: z.object({
    days: z.number().int().describe('Calendar days from start to end (signed).'),
    weeks: z.number().describe('days / 7, rounded to 6 decimals.'),
    calendar: z.object({ years: z.number().int(), months: z.number().int(), days: z.number().int() }),
    totalMonths: z.number().int().describe('Whole months between the dates (signed).'),
    elapsed: z
      .object({ milliseconds: z.number(), seconds: z.number(), minutes: z.number(), hours: z.number(), days: z.number() })
      .nullable()
      .describe('Exact elapsed time; only when both inputs are date-times.'),
    start: z.string(),
    end: z.string(),
  }),
  execute(input) {
    const zone = tz(input.timeZone);
    const s = toDay(input.start, 'start', zone);
    const e = toDay(input.end, 'end', zone);
    const days = e.day - s.day;
    const cal = calendarDifference(s.day, e.day);
    let elapsed = null;
    if (s.parsed.kind === 'datetime' && e.parsed.kind === 'datetime') {
      const ms = e.parsed.epochMs - s.parsed.epochMs;
      const r = (v: number) => Math.round(v * 1e6) / 1e6;
      elapsed = { milliseconds: ms, seconds: r(ms / 1000), minutes: r(ms / 60_000), hours: r(ms / 3_600_000), days: r(ms / 86_400_000) };
    }
    return {
      days,
      weeks: Math.round((days / 7) * 1e6) / 1e6 || 0,
      calendar: cal,
      totalMonths: cal.years * 12 + cal.months,
      elapsed,
      start: formatEpochDay(s.day),
      end: formatEpochDay(e.day),
    };
  },
});

export const addDays = defineTool({
  name: 'add_days',
  title: 'Add calendar days',
  description:
    'Adds (or subtracts, with a negative number) calendar days to a date. For date-times the wall-clock time is preserved, including across DST changes when timeZone is given.',
  whenToUse: ['"what date is 90 days after 2026-02-10?"', 'deadlines in calendar days'],
  whenNotToUse: ['working days (use datetime.add_business_days)'],
  limitations: [
    'with timeZone, a wall-clock time that does not exist (DST gap) moves forward by the gap; an ambiguous time (DST overlap) resolves to the earlier instant',
    'without timeZone, date-times keep their original fixed offset',
    NO_HOST_TZ,
    NO_NOW,
  ],
  examples: [{ input: { date: '2026-02-10', days: 90 }, output: { result: '2026-05-11', dayOfWeek: 'monday' } }],
  input: z.strictObject({
    date: dateInput('Start date.'),
    days: z.number().int().min(-3_650_000).max(3_650_000).describe('Days to add; negative to subtract.'),
    timeZone,
  }),
  output: z.object({
    result: z.string().describe('Resulting date (YYYY-MM-DD) or date-time with offset, matching the input kind.'),
    date: z.string().describe('Resulting calendar date YYYY-MM-DD.'),
    dayOfWeek: dayOfWeekOutput,
  }),
  execute(input) {
    const zone = tz(input.timeZone);
    const parsed = parseDateInput(input.date, 'date');
    if (parsed.kind === 'date') {
      const day = parsed.epochDay + input.days;
      checkEpochDay(day, 'days');
      const s = formatEpochDay(day);
      return { result: s, date: s, dayOfWeek: weekdayName(day) };
    }
    const r = addDaysToInstant(parsed, input.days, zone);
    const day = Math.floor((r.epochMs + r.offsetMinutes * 60_000) / 86_400_000);
    checkEpochDay(day, 'days');
    return { result: formatInstant(r.epochMs, r.offsetMinutes, parsed.hasFraction), date: formatEpochDay(day), dayOfWeek: weekdayName(day) };
  },
});

const businessLimitations = [
  'weekend defaults to saturday + sunday and is echoed in the output',
  'holidays must be supplied explicitly; no country calendars are built in',
  NO_HOST_TZ,
  NO_NOW,
];

export const addBusinessDays = defineTool({
  name: 'add_business_days',
  title: 'Add business days',
  description:
    'Moves a date forward (or backward, with a negative number) by a number of business days, skipping weekends and the given holidays. Same semantics as Excel WORKDAY.',
  whenToUse: ['"delivery in 10 business days from 2026-12-18"', 'SLA and settlement dates (T+2)'],
  whenNotToUse: ['calendar days (use datetime.add_days)'],
  limitations: [
    'the start date itself is never counted; days = 0 returns the start date unchanged even if it is not a business day',
    ...businessLimitations,
  ],
  examples: [{ input: { date: '2026-12-24', days: 3, holidays: ['2026-12-25', '2026-12-26'] }, output: { result: '2026-12-30' } }],
  input: z.strictObject({
    date: dateInput('Start date.'),
    days: z.number().int().min(-100_000).max(100_000).describe('Business days to add; negative to go backward.'),
    weekend,
    holidays,
    timeZone,
  }),
  output: z.object({
    result: z.string().describe('Resulting date YYYY-MM-DD.'),
    dayOfWeek: dayOfWeekOutput,
    calendarDays: z.number().int().describe('Calendar days between start and result (signed).'),
    weekend: z.array(z.enum(WEEKDAYS)),
  }),
  execute(input) {
    if (input.weekend.length >= 7) throw invalidInput('weekend cannot contain every day of the week', 'weekend');
    const zone = tz(input.timeZone);
    const { day: start } = toDay(input.date, 'date', zone);
    const cal = businessCalendar(input.weekend, input.holidays);
    let day = start;
    let remaining = Math.abs(input.days);
    const step = input.days < 0 ? -1 : 1;
    while (remaining > 0) {
      day += step;
      if (isBusiness(day, cal)) remaining--;
    }
    checkEpochDay(day, 'days');
    return { result: formatEpochDay(day), dayOfWeek: weekdayName(day), calendarDays: day - start, weekend: [...new Set(input.weekend)] };
  },
});

export const ENDPOINTS = ['both', 'start_only', 'end_only', 'neither'] as const;

export const businessDaysBetween = defineTool({
  name: 'business_days_between',
  title: 'Business days between dates',
  description:
    'Counts business days between two dates, excluding weekends and the given holidays. With endpoints "both" it matches Excel NETWORKDAYS.',
  whenToUse: ['working days in a period', '"how many business days until the deadline?"'],
  whenNotToUse: ['calendar days (use datetime.date_difference)'],
  limitations: [
    'endpoints controls whether start and end are counted: both (default, NETWORKDAYS), start_only, end_only, neither',
    'result is negative when end is before start',
    ...businessLimitations,
  ],
  examples: [{ input: { start: '2026-06-01', end: '2026-06-30' }, output: { result: 22, endpoints: 'both' } }],
  input: z.strictObject({
    start: dateInput('Start date.'),
    end: dateInput('End date.'),
    weekend,
    holidays,
    endpoints: z.enum(ENDPOINTS).default('both').describe('Which endpoints are counted. Default "both".'),
    timeZone,
  }),
  output: z.object({
    result: z.number().int(),
    calendarDays: z.number().int(),
    endpoints: z.enum(ENDPOINTS),
    weekend: z.array(z.enum(WEEKDAYS)),
  }),
  execute(input) {
    if (input.weekend.length >= 7) throw invalidInput('weekend cannot contain every day of the week', 'weekend');
    const zone = tz(input.timeZone);
    const { day: s } = toDay(input.start, 'start', zone);
    const { day: e } = toDay(input.end, 'end', zone);
    const cal = businessCalendar(input.weekend, input.holidays);
    const [a, b] = s <= e ? [s, e] : [e, s];
    let count: number;
    if (s === e) {
      count = input.endpoints !== 'neither' && isBusiness(s, cal) ? 1 : 0;
    } else {
      count = countBusinessDays(a, b, cal);
      const includeStart = input.endpoints === 'both' || input.endpoints === 'start_only';
      const includeEnd = input.endpoints === 'both' || input.endpoints === 'end_only';
      if (!includeStart && isBusiness(s, cal)) count--;
      if (!includeEnd && isBusiness(e, cal)) count--;
    }
    return {
      result: s <= e ? count : -count,
      calendarDays: e - s,
      endpoints: input.endpoints,
      weekend: [...new Set(input.weekend)],
    };
  },
});

export const isBusinessDay = defineTool({
  name: 'is_business_day',
  title: 'Is business day',
  description: 'Checks whether a date is a business day given weekend days and holidays.',
  whenToUse: ['"is 2026-05-01 a working day?" (with the relevant holidays)'],
  limitations: businessLimitations,
  examples: [{ input: { date: '2026-05-01', holidays: ['2026-05-01'] }, output: { result: false, reason: 'holiday' } }],
  input: z.strictObject({ date: dateInput('Date to check.'), weekend, holidays, timeZone }),
  output: z.object({
    result: z.boolean(),
    reason: z.enum(['weekend', 'holiday']).nullable().describe('Why it is not a business day; null if it is.'),
    date: z.string(),
    dayOfWeek: dayOfWeekOutput,
  }),
  execute(input) {
    const zone = tz(input.timeZone);
    const { day } = toDay(input.date, 'date', zone);
    const cal = businessCalendar(input.weekend, input.holidays);
    const reason: 'weekend' | 'holiday' | null = cal.weekend.has(isoWeekday(day))
      ? 'weekend'
      : cal.holidays.has(day)
        ? 'holiday'
        : null;
    return { result: reason === null, reason, date: formatEpochDay(day), dayOfWeek: weekdayName(day) };
  },
});

export const dayOfWeek = defineTool({
  name: 'day_of_week',
  title: 'Day of week',
  description: 'Returns the weekday of a date (proleptic Gregorian calendar) with its ISO number (Monday = 1 ... Sunday = 7).',
  whenToUse: ['"what weekday is 2030-07-04?"'],
  limitations: ['for date-times the weekday is taken in timeZone if given, otherwise in the offset of the input', NO_HOST_TZ],
  examples: [{ input: { date: '2030-07-04' }, output: { result: 'thursday', isoWeekday: 4 } }],
  input: z.strictObject({ date: dateInput('Date.'), timeZone }),
  output: z.object({
    result: dayOfWeekOutput,
    isoWeekday: z.number().int().min(1).max(7),
    date: z.string(),
    isWeekend: z.boolean().describe('True for Saturday or Sunday.'),
  }),
  execute(input) {
    const zone = tz(input.timeZone);
    const { day } = toDay(input.date, 'date', zone);
    const iso = isoWeekday(day);
    return { result: weekdayName(day), isoWeekday: iso, date: formatEpochDay(day), isWeekend: iso >= 6 };
  },
});

const year = z.number().int().min(MIN_YEAR).max(MAX_YEAR).describe(`Year (${MIN_YEAR}-${MAX_YEAR}, proleptic Gregorian).`);

export const daysInMonthTool = defineTool({
  name: 'days_in_month',
  title: 'Days in month',
  description: 'Number of days in a given month of a given year (Gregorian calendar, leap years included).',
  whenToUse: ['"how many days does February 2028 have?"'],
  examples: [{ input: { year: 2028, month: 2 }, output: { result: 29, isLeapYear: true } }],
  input: z.strictObject({ year, month: z.number().int().min(1).max(12).describe('Month 1-12.') }),
  output: z.object({
    result: z.number().int(),
    year: z.number().int(),
    month: z.number().int(),
    isLeapYear: z.boolean(),
    firstDay: z.string(),
    lastDay: z.string(),
  }),
  execute({ year: y, month: m }) {
    const n = daysInMonth(y, m);
    return {
      result: n,
      year: y,
      month: m,
      isLeapYear: isLeapYear(y),
      firstDay: formatEpochDay(daysFromCivil({ y, m, d: 1 })),
      lastDay: formatEpochDay(daysFromCivil({ y, m, d: n })),
    };
  },
});

export const isLeapYearTool = defineTool({
  name: 'is_leap_year',
  title: 'Is leap year',
  description: 'Checks whether a year is a leap year in the Gregorian calendar (divisible by 4, except centuries not divisible by 400).',
  whenToUse: ['"is 2100 a leap year?"'],
  examples: [{ input: { year: 2100 }, output: { result: false, daysInYear: 365 } }],
  input: z.strictObject({ year }),
  output: z.object({ result: z.boolean(), year: z.number().int(), daysInYear: z.number().int() }),
  execute({ year: y }) {
    const leap = isLeapYear(y);
    return { result: leap, year: y, daysInYear: leap ? 366 : 365 };
  },
});