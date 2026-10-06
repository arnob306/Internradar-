import {
  evaluateStoredEligibility,
  type EligibilityResult,
  type Month,
  type ProgramType,
  type StudentProfile,
  type YearMonth,
} from "@internradar/domain";
import type { WindowStatus } from "../../components/StatusChip";
import { headlineWindow } from "./headline-window";

/** The parts of an application window the engine needs. Dates are ISO `YYYY-MM-DD`. */
export interface EligibilityWindow {
  readonly cycleYear: number;
  readonly programStartsOn: string | null;
  readonly programEndsOn: string | null;
  readonly status: WindowStatus;
}

export interface EligibilityInput {
  readonly programType: ProgramType;
  /** Newest first. */
  readonly windows: readonly EligibilityWindow[];
  /** Read straight from the database, so untrusted: the engine parses it before using it. */
  readonly eligibilityRules: unknown;
  readonly rulesVerified: boolean;
}

function toYearMonth(isoDate: string | null): YearMonth | null {
  if (isoDate === null) {
    return null;
  }
  return { year: Number(isoDate.slice(0, 4)), month: Number(isoDate.slice(5, 7)) as Month };
}

/**
 * Judge one program for one student with the engine. The program's own dates come from the
 * window the student can still act on. With no window at all there are no dates to read, so the
 * cycle year falls back to the current year and the engine fills in typical timing (and says it
 * did); rules that need no dates, such as a graduation window, are judged as normal.
 */
export function evaluateProgram(
  program: EligibilityInput,
  profile: StudentProfile,
  today: string,
): EligibilityResult {
  const window = headlineWindow(program.windows);

  return evaluateStoredEligibility(program.eligibilityRules, profile, {
    programType: program.programType,
    cycleYear: window?.cycleYear ?? Number(today.slice(0, 4)),
    programStart: toYearMonth(window?.programStartsOn ?? null),
    programEnd: toYearMonth(window?.programEndsOn ?? null),
    rulesVerified: program.rulesVerified,
    rulesVersion: 1,
  });
}
