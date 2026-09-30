import { addMonths } from "../academic-calendar/year-month";
import type { Month, YearMonth } from "../academic-calendar/semesters";

export type ProgramType = "internship" | "vacationer" | "graduate" | "cadetship" | "discovery";

/** The dates of one application window's program. Either date may be missing. */
export interface ProgramWindow {
  readonly programType: ProgramType;
  /** The calendar year the program STARTS (decision D1). */
  readonly cycleYear: number;
  readonly programStart: YearMonth | null;
  readonly programEnd: YearMonth | null;
}

export interface ResolvedProgramDates {
  readonly start: YearMonth | null;
  readonly end: YearMonth | null;
  /** True when a date was filled in from the program type, not given by the employer. */
  readonly assumed: boolean;
}

interface TypicalProgram {
  readonly startMonth: Month;
  readonly durationMonths: number;
}

/**
 * Typical timing, used only when a date is missing. Cadetships and discovery programs
 * have no defensible default, so they are left out: a missing date stays missing and the
 * year-level rule answers "unknown" instead of guessing.
 */
const TYPICAL_PROGRAMS: Partial<Record<ProgramType, TypicalProgram>> = {
  internship: { startMonth: 11, durationMonths: 3 },
  vacationer: { startMonth: 11, durationMonths: 3 },
  graduate: { startMonth: 2, durationMonths: 12 },
};

export function resolveProgramDates(window: ProgramWindow): ResolvedProgramDates {
  const typical = TYPICAL_PROGRAMS[window.programType];
  if (typical === undefined) {
    return { start: window.programStart, end: window.programEnd, assumed: false };
  }
  const start = window.programStart ?? { year: window.cycleYear, month: typical.startMonth };
  const end = window.programEnd ?? addMonths(start, typical.durationMonths);
  return { start, end, assumed: window.programStart === null || window.programEnd === null };
}
