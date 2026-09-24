# @rickrosten/agent-deterministic-tools-datetime

Deterministic calendar tools for AI agents. **No hidden time zone, no hidden "now".**

Tools: `datetime.date_difference`, `add_days`, `add_business_days`, `business_days_between`,
`is_business_day`, `day_of_week`, `days_in_month`, `is_leap_year`.

## Rules

- Dates are `YYYY-MM-DD` (proleptic Gregorian, years 1-9999). Calendar arithmetic is pure
  integer epoch-day math and never touches `Date` or the host time zone.
- Date-times must be ISO 8601 **with an offset** (`2026-03-15T09:30:00+01:00`, `...Z`).
  Date-times without an offset are rejected with `INVALID_DATE`.
- Time zones are explicit IANA names (`timeZone: "Europe/Berlin"`). With `timeZone`,
  date-times are interpreted as local wall-clock time in that zone, and `add_days` preserves
  wall-clock time across DST (gaps move forward, overlaps pick the earlier instant, the same as
  Temporal's `compatible`). Without it, the offset written in the input is used.
- There is no implicit current date: pass "today" explicitly.
- Business days: `weekend` defaults to `["saturday", "sunday"]` (echoed back). Holidays are
  passed explicitly as `YYYY-MM-DD`. `add_business_days` follows Excel `WORKDAY`;
  `business_days_between` with `endpoints: "both"` follows Excel `NETWORKDAYS`.
- `date_difference` breakdown adds whole months with end-of-month clamping
  (Jan 31 + 1 month = Feb 28/29).
