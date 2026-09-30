import { semestersRemaining, type YearMonth } from "../academic-calendar/semesters";
import { monthPosition } from "../academic-calendar/year-month";
import { resolveProgramDates, type ProgramWindow } from "./program-dates";
import type { CriterionResult, ReasonCode, ReasonParams, Verdict } from "./types";

export type YearLevelPreset = "penultimate" | "pre_penultimate" | "final_year";
export type MeasuredAt = "program_start" | "program_end";

/** Either a named preset, or explicit semester bounds (both inclusive, both optional). */
export type YearLevelRule =
  | { readonly preset: YearLevelPreset }
  | {
      readonly minSemestersRemaining?: number;
      readonly maxSemestersRemaining?: number;
      readonly measuredAt: MeasuredAt;
    };

export interface YearLevelInput {
  readonly rule: YearLevelRule;
  /** Some programs explicitly take students who finish after one more semester. */
  readonly acceptsMidYearGraduates: boolean;
  readonly expectedGraduation: YearMonth | null;
  readonly window: ProgramWindow;
}

// Presets are measured where the design says: a student's year level is judged at the
// end of a placement, but "final year" is judged when a graduate program starts.
const PRESET_MEASURED_AT: Readonly<Record<YearLevelPreset, MeasuredAt>> = {
  penultimate: "program_end",
  pre_penultimate: "program_end",
  final_year: "program_start",
};

interface Classification {
  readonly verdict: Verdict;
  readonly code: ReasonCode;
}

const OK: Classification = { verdict: "eligible", code: "YEAR_LEVEL_OK" };
const OUT_OF_RANGE: Classification = {
  verdict: "ineligible",
  code: "SEMESTERS_REMAINING_OUT_OF_RANGE",
};
const MID_YEAR: Classification = { verdict: "unknown", code: "MID_YEAR_GRADUATE_CHECK_EMPLOYER" };
const OFF_CYCLE: Classification = { verdict: "unknown", code: "OFF_CYCLE_GRADUATION_CHECK_EMPLOYER" };

function classifyPreset(
  preset: YearLevelPreset,
  semesters: number,
  acceptsMidYearGraduates: boolean,
): Classification {
  switch (preset) {
    case "penultimate":
      if (semesters === 2) return OK;
      if (semesters === 1) return acceptsMidYearGraduates ? OK : MID_YEAR;
      if (semesters === 3) return OFF_CYCLE;
      return OUT_OF_RANGE;
    case "pre_penultimate":
      if (semesters >= 4) return OK;
      if (semesters === 3) return OFF_CYCLE;
      return OUT_OF_RANGE;
    case "final_year":
      return semesters <= 1 ? OK : OUT_OF_RANGE;
  }
}

function classifyBounds(
  semesters: number,
  min: number | undefined,
  max: number | undefined,
): Classification {
  const aboveMin = min === undefined || semesters >= min;
  const belowMax = max === undefined || semesters <= max;
  return aboveMin && belowMax ? OK : OUT_OF_RANGE;
}

function result(verdict: Verdict, code: ReasonCode, params: ReasonParams): CriterionResult {
  return { criterion: "year_level", verdict, code, params };
}

export function evaluateYearLevel(input: YearLevelInput): CriterionResult {
  if (input.expectedGraduation === null) {
    return result("unknown", "PROFILE_INCOMPLETE", { field: "expectedGraduation" });
  }

  const { rule } = input;
  const measuredAt = "preset" in rule ? PRESET_MEASURED_AT[rule.preset] : rule.measuredAt;
  const dates = resolveProgramDates(input.window);
  const measuredFrom = measuredAt === "program_start" ? dates.start : dates.end;
  if (measuredFrom === null) {
    return result("unknown", "PROGRAM_DATES_MISSING", { measuredAt });
  }

  const semesters = semestersRemaining(measuredFrom, input.expectedGraduation);
  const params = {
    semesters,
    measuredAt,
    ...(dates.assumed ? { assumedProgramDates: true } : {}),
  };

  // "0 semesters left" also describes someone who finished years ago, so it cannot tell
  // them apart from someone finishing now. A year-level rule never counts a graduate.
  if (monthPosition(input.expectedGraduation) < monthPosition(measuredFrom)) {
    return result("ineligible", "ALREADY_GRADUATED", params);
  }

  const { verdict, code } =
    "preset" in rule
      ? classifyPreset(rule.preset, semesters, input.acceptsMidYearGraduates)
      : classifyBounds(semesters, rule.minSemestersRemaining, rule.maxSemestersRemaining);

  return result(verdict, code, params);
}
