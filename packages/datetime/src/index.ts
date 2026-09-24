import { defineModule } from '@rickrosten/agent-deterministic-tools-core';
import {
  addBusinessDays,
  addDays,
  businessDaysBetween,
  dateDifference,
  dayOfWeek,
  daysInMonthTool,
  isBusinessDay,
  isLeapYearTool,
} from './tools.js';

export const VERSION = '1.0.0';

export const tools = [
  dateDifference,
  addDays,
  addBusinessDays,
  businessDaysBetween,
  isBusinessDay,
  dayOfWeek,
  daysInMonthTool,
  isLeapYearTool,
] as const;

export const datetimeModule = defineModule({
  id: 'datetime',
  name: 'DateTime',
  version: VERSION,
  description:
    'Calendar arithmetic without hidden time zones: date differences, adding days and business days, business-day checks, weekday, days in month, leap years.',
  tools,
});

export default datetimeModule;

export {
  dateDifference,
  addDays,
  addBusinessDays,
  businessDaysBetween,
  isBusinessDay,
  dayOfWeek,
  daysInMonthTool as daysInMonth,
  isLeapYearTool as isLeapYear,
};
export { WEEKDAYS, type Weekday } from './calendar.js';
