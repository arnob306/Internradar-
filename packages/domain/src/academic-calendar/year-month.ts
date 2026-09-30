import type { Month, YearMonth } from "./semesters";

const MONTHS_PER_YEAR = 12;

/** A single number that increases by one each month, so months can be compared and subtracted. */
export function monthPosition(value: YearMonth): number {
  return value.year * MONTHS_PER_YEAR + value.month;
}

/** The month `months` after `start`. Negative values go back. */
export function addMonths(start: YearMonth, months: number): YearMonth {
  const monthsSinceYearZero = start.year * MONTHS_PER_YEAR + (start.month - 1) + months;
  const year = Math.floor(monthsSinceYearZero / MONTHS_PER_YEAR);
  const month = (monthsSinceYearZero - year * MONTHS_PER_YEAR + 1) as Month;
  return { year, month };
}
