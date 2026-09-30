/**
 * Australian semester arithmetic (decision D5). The academic year has two semesters:
 * S1 starts in February and S2 in July. Year level is measured by how many semesters
 * a student has left, which handles mid-year graduates and double degrees without
 * special cases.
 */

export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** A calendar month. Dates in this domain have month precision only. */
export interface YearMonth {
  readonly year: number;
  readonly month: Month;
}

export type Term = "S1" | "S2";

export interface Semester {
  readonly year: number;
  readonly term: Term;
}

const JANUARY = 1;
const S1_START_MONTH = 2;
const S2_START_MONTH = 7;
const LAST_MONTH_OF_S1_GRADUATION = 8; // August: a mid-year graduate finishes S1

/**
 * The semester a student is in when they graduate.
 *  - January finishes the previous year's S2.
 *  - February to August finishes S1 of that year. June to August is the usual
 *    mid-year graduate. February to May is an ASSUMPTION (the design does not say):
 *    it counts as the S1 that is running.
 *  - September to December finishes S2 of that year.
 */
export function finalSemester(graduation: YearMonth): Semester {
  const { year, month } = graduation;
  if (month === JANUARY) {
    return { year: year - 1, term: "S2" };
  }
  if (month <= LAST_MONTH_OF_S1_GRADUATION) {
    return { year, term: "S1" };
  }
  return { year, term: "S2" };
}

/** Position on a single number line, so semesters can be subtracted. */
function semesterNumber(semester: Semester): number {
  return semester.year * 2 + (semester.term === "S2" ? 1 : 0);
}

/** The first semester whose start month is in or after `after`. */
function firstSemesterStartingFrom(after: YearMonth): Semester {
  if (after.month <= S1_START_MONTH) {
    return { year: after.year, term: "S1" };
  }
  if (after.month <= S2_START_MONTH) {
    return { year: after.year, term: "S2" };
  }
  return { year: after.year + 1, term: "S1" };
}

/**
 * How many semesters are left: semester starts in or after the month `after`, up to
 * and including the final semester. A semester that has already started does not count.
 * Never negative.
 */
export function semestersRemaining(after: YearMonth, graduation: YearMonth): number {
  const remaining =
    semesterNumber(finalSemester(graduation)) - semesterNumber(firstSemesterStartingFrom(after)) + 1;
  return Math.max(0, remaining);
}
