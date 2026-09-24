import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import { createRegistry } from '@rickrosten/agent-deterministic-tools-core';
import { datetimeModule } from '@rickrosten/agent-deterministic-tools-datetime';

const registry = createRegistry([datetimeModule]);
const ok = async (tool: string, input: unknown) => {
  const res = await registry.execute<Record<string, unknown>>(`datetime.${tool}`, input);
  if (!res.ok) throw new Error(`${tool} failed: ${JSON.stringify(res.error)}`);
  return res.data;
};
const err = async (tool: string, input: unknown) => {
  const res = await registry.execute(`datetime.${tool}`, input);
  if (res.ok) throw new Error(`${tool} unexpectedly succeeded: ${JSON.stringify(res.data)}`);
  return res.error;
};

const isoDate = fc
  .date({ min: new Date(Date.UTC(1, 0, 1)), max: new Date(Date.UTC(9999, 11, 31)), noInvalidDate: true })
  .map((d) => d.toISOString().slice(0, 10))
  .filter((s) => /^\d{4}-/.test(s));

describe('datetime module', () => {
  it('exposes all required tools', () => {
    expect(registry.list().map((t) => t.name)).toEqual([
      'datetime.date_difference',
      'datetime.add_days',
      'datetime.add_business_days',
      'datetime.business_days_between',
      'datetime.is_business_day',
      'datetime.day_of_week',
      'datetime.days_in_month',
      'datetime.is_leap_year',
    ]);
  });
});

describe('parsing', () => {
  it('rejects date-times without offset (no hidden machine time zone)', async () => {
    expect(await err('day_of_week', { date: '2026-03-01T10:00:00' })).toMatchObject({ code: 'INVALID_DATE', field: 'date' });
  });
  it('rejects impossible dates', async () => {
    expect(await err('day_of_week', { date: '2026-02-30' })).toMatchObject({ code: 'INVALID_DATE' });
    expect(await err('day_of_week', { date: '2026-13-01' })).toMatchObject({ code: 'INVALID_DATE' });
    expect(await err('day_of_week', { date: '2026-01-01T24:00:00Z' })).toMatchObject({ code: 'INVALID_DATE' });
    expect(await err('day_of_week', { date: '01/02/2026' })).toMatchObject({ code: 'INVALID_DATE' });
  });
  it('rejects invalid time zones', async () => {
    expect(await err('day_of_week', { date: '2026-01-01', timeZone: 'Mars/Olympus' })).toMatchObject({ code: 'INVALID_INPUT', field: 'timeZone' });
  });
  it('rejects out-of-range years', async () => {
    expect(await err('add_days', { date: '9999-12-31', days: 1 })).toMatchObject({ code: 'OUT_OF_RANGE' });
  });
});

describe('date_difference', () => {
  it('calendar difference with end-of-month clamping', async () => {
    expect(await ok('date_difference', { start: '2024-01-31', end: '2025-03-01' })).toMatchObject({
      days: 395,
      calendar: { years: 1, months: 1, days: 1 },
      totalMonths: 13,
      elapsed: null,
    });
  });
  it('negative differences', async () => {
    expect(await ok('date_difference', { start: '2026-03-01', end: '2026-01-15' })).toMatchObject({
      days: -45,
      calendar: { years: 0, months: -1, days: -14 },
    });
  });
  it('leap day birthdays', async () => {
    expect(await ok('date_difference', { start: '2000-02-29', end: '2026-02-28' })).toMatchObject({ calendar: { years: 26, months: 0, days: 0 } });
    expect(await ok('date_difference', { start: '2000-02-29', end: '2026-02-27' })).toMatchObject({ calendar: { years: 25, months: 11, days: 29 } });
    expect(await ok('date_difference', { start: '2026-01-31', end: '2026-02-28' })).toMatchObject({ calendar: { years: 0, months: 1, days: 0 } });
    expect(await ok('date_difference', { start: '2000-02-29', end: '2028-02-29' })).toMatchObject({ calendar: { years: 28, months: 0, days: 0 } });
  });
  it('exact elapsed time across DST', async () => {
    const r = await ok('date_difference', { start: '2026-03-28T12:00:00+01:00', end: '2026-03-29T12:00:00+02:00' });
    expect(r).toMatchObject({ days: 1, elapsed: { hours: 23, milliseconds: 82_800_000 } });
  });
  it('property: matches Date.UTC day arithmetic', async () => {
    await fc.assert(
      fc.asyncProperty(isoDate, isoDate, async (a, b) => {
        const expected = (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;
        expect((await ok('date_difference', { start: a, end: b })).days).toBe(expected);
      }),
      { numRuns: 200 },
    );
  });
});

describe('add_days', () => {
  it('known values', async () => {
    expect(await ok('add_days', { date: '2026-02-10', days: 90 })).toEqual({ result: '2026-05-11', date: '2026-05-11', dayOfWeek: 'monday' });
    expect(await ok('add_days', { date: '2024-03-01', days: -1 })).toMatchObject({ result: '2024-02-29' });
    expect(await ok('add_days', { date: '2026-12-31', days: 0 })).toMatchObject({ result: '2026-12-31', dayOfWeek: 'thursday' });
  });
  it('preserves wall clock across DST with a time zone', async () => {
    expect(await ok('add_days', { date: '2026-03-28T12:00:00+01:00', days: 1, timeZone: 'Europe/Berlin' })).toMatchObject({
      result: '2026-03-29T12:00:00+02:00',
    });
    expect(await ok('add_days', { date: '2026-03-28T12:00:00+01:00', days: 1 })).toMatchObject({ result: '2026-03-29T12:00:00+01:00' });
  });
  it('DST gap moves forward, overlap picks the earlier instant', async () => {
    expect(await ok('add_days', { date: '2026-03-28T02:30:00+01:00', days: 1, timeZone: 'Europe/Berlin' })).toMatchObject({
      result: '2026-03-29T03:30:00+02:00',
    });
    expect(await ok('add_days', { date: '2026-10-24T02:30:00+02:00', days: 1, timeZone: 'Europe/Berlin' })).toMatchObject({
      result: '2026-10-25T02:30:00+02:00',
    });
  });
  it('keeps milliseconds when present', async () => {
    expect(await ok('add_days', { date: '2026-01-01T00:00:00.5Z', days: 1 })).toMatchObject({ result: '2026-01-02T00:00:00.500+00:00' });
  });
  it('property: matches Date.UTC', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.date({ min: new Date(Date.UTC(1900, 0, 1)), max: new Date(Date.UTC(2100, 0, 1)), noInvalidDate: true }),
        fc.integer({ min: -50_000, max: 50_000 }),
        async (d, n) => {
          const start = d.toISOString().slice(0, 10);
          const expected = new Date(Date.parse(`${start}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
          expect((await ok('add_days', { date: start, days: n })).result).toBe(expected);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('business days', () => {
  it('add_business_days (Excel WORKDAY semantics)', async () => {
    expect(await ok('add_business_days', { date: '2026-12-24', days: 3, holidays: ['2026-12-25', '2026-12-26'] })).toMatchObject({
      result: '2026-12-30',
      calendarDays: 6,
      weekend: ['saturday', 'sunday'],
    });
    expect(await ok('add_business_days', { date: '2026-09-28', days: -1 })).toMatchObject({ result: '2026-09-25', dayOfWeek: 'friday' });
    expect(await ok('add_business_days', { date: '2026-09-26', days: 0 })).toMatchObject({ result: '2026-09-26' });
  });
  it('custom weekend', async () => {
    expect(await ok('add_business_days', { date: '2026-09-24', days: 1, weekend: ['friday', 'saturday'] })).toMatchObject({ result: '2026-09-27' });
    expect(await err('add_business_days', { date: '2026-09-24', days: 1, weekend: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] })).toMatchObject({
      code: 'INVALID_INPUT',
      field: 'weekend',
    });
  });
  it('business_days_between (Excel NETWORKDAYS)', async () => {
    expect(await ok('business_days_between', { start: '2026-06-01', end: '2026-06-30' })).toMatchObject({ result: 22, endpoints: 'both' });
    expect(await ok('business_days_between', { start: '2026-06-01', end: '2026-06-30', holidays: ['2026-06-19', '2026-06-20'] })).toMatchObject({ result: 21 });
    expect(await ok('business_days_between', { start: '2026-06-30', end: '2026-06-01' })).toMatchObject({ result: -22 });
    expect(await ok('business_days_between', { start: '2026-06-01', end: '2026-06-05', endpoints: 'neither' })).toMatchObject({ result: 3 });
    expect(await ok('business_days_between', { start: '2026-06-01', end: '2026-06-05', endpoints: 'end_only' })).toMatchObject({ result: 4 });
    expect(await ok('business_days_between', { start: '2026-06-01', end: '2026-06-01' })).toMatchObject({ result: 1 });
    expect(await ok('business_days_between', { start: '2026-06-06', end: '2026-06-07' })).toMatchObject({ result: 0 });
  });
  it('property: add_business_days(n) then counting gives n', async () => {
    await fc.assert(
      fc.asyncProperty(isoDate.filter((d) => d > '1900' && d < '2900'), fc.integer({ min: 1, max: 500 }), async (d, n) => {
        const target = (await ok('add_business_days', { date: d, days: n })).result;
        const count = (await ok('business_days_between', { start: d, end: target, endpoints: 'end_only' })).result;
        expect(count).toBe(n);
      }),
      { numRuns: 100 },
    );
  });
  it('is_business_day', async () => {
    expect(await ok('is_business_day', { date: '2026-05-01', holidays: ['2026-05-01'] })).toEqual({
      result: false,
      reason: 'holiday',
      date: '2026-05-01',
      dayOfWeek: 'friday',
    });
    expect(await ok('is_business_day', { date: '2026-05-02' })).toMatchObject({ result: false, reason: 'weekend' });
    expect(await ok('is_business_day', { date: '2026-05-04' })).toMatchObject({ result: true, reason: null });
  });
  it('validates holidays', async () => {
    expect(await err('is_business_day', { date: '2026-05-01', holidays: ['May 1'] })).toMatchObject({ code: 'INVALID_INPUT', field: 'holidays[0]' });
    expect(await err('is_business_day', { date: '2026-05-01', holidays: ['2026-02-31'] })).toMatchObject({ code: 'INVALID_DATE', field: 'holidays[0]' });
  });
});

describe('day_of_week / days_in_month / is_leap_year', () => {
  it('day_of_week', async () => {
    expect(await ok('day_of_week', { date: '2030-07-04' })).toEqual({ result: 'thursday', isoWeekday: 4, date: '2030-07-04', isWeekend: false });
    expect(await ok('day_of_week', { date: '0001-01-01' })).toMatchObject({ result: 'monday' });
    expect(await ok('day_of_week', { date: '1970-01-01' })).toMatchObject({ result: 'thursday' });
  });
  it('uses the input offset or the explicit time zone', async () => {
    const date = '2026-01-01T02:00:00+05:00';
    expect(await ok('day_of_week', { date })).toMatchObject({ date: '2026-01-01', result: 'thursday' });
    expect(await ok('day_of_week', { date, timeZone: 'America/New_York' })).toMatchObject({ date: '2025-12-31', result: 'wednesday' });
  });
  it('days_in_month', async () => {
    expect(await ok('days_in_month', { year: 2028, month: 2 })).toEqual({
      result: 29,
      year: 2028,
      month: 2,
      isLeapYear: true,
      firstDay: '2028-02-01',
      lastDay: '2028-02-29',
    });
    expect(await ok('days_in_month', { year: 2100, month: 2 })).toMatchObject({ result: 28 });
    expect(await err('days_in_month', { year: 2026, month: 13 })).toMatchObject({ code: 'INVALID_INPUT', field: 'month' });
  });
  it('is_leap_year', async () => {
    expect(await ok('is_leap_year', { year: 2000 })).toEqual({ result: true, year: 2000, daysInYear: 366 });
    expect(await ok('is_leap_year', { year: 2100 })).toMatchObject({ result: false });
    expect(await ok('is_leap_year', { year: 2024 })).toMatchObject({ result: true });
    expect(await ok('is_leap_year', { year: 2026 })).toMatchObject({ result: false });
  });
});

describe('determinism', () => {
  const original = process.env['TZ'];
  afterEach(() => {
    if (original === undefined) delete process.env['TZ'];
    else process.env['TZ'] = original;
  });
  it('results do not depend on the host time zone', async () => {
    const inputs = [
      ['date_difference', { start: '2026-03-28T23:30:00+01:00', end: '2026-03-30T00:30:00+02:00' }],
      ['add_days', { date: '2026-03-28T12:00:00+01:00', days: 1, timeZone: 'Europe/Berlin' }],
      ['day_of_week', { date: '2026-01-01T02:00:00+05:00' }],
      ['business_days_between', { start: '2026-01-01', end: '2026-12-31' }],
    ] as const;
    const snapshots: string[] = [];
    for (const zone of ['UTC', 'America/Los_Angeles', 'Asia/Kolkata', 'Pacific/Kiritimati']) {
      process.env['TZ'] = zone;
      const out = [];
      for (const [tool, input] of inputs) out.push(await ok(tool, input));
      snapshots.push(JSON.stringify(out));
    }
    expect(new Set(snapshots).size).toBe(1);
  });
});
