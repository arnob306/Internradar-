import type { YearMonth } from "../academic-calendar/semesters";
import type { CriterionResult } from "./types";

/** Both ends are optional and inclusive, at month precision. */
export interface GraduationWindowRule {
  readonly earliest?: YearMonth;
  readonly latest?: YearMonth;
}

const MONTHS_PER_YEAR = 12;

function position(value: YearMonth): number {
  return value.year * MONTHS_PER_YEAR + value.month;
}

export function evaluateGraduationWindow(
  rule: GraduationWindowRule,
  graduation: YearMonth | null,
): CriterionResult {
  if (graduation === null) {
    return {
      criterion: "graduation_window",
      verdict: "unknown",
      code: "PROFILE_INCOMPLETE",
      params: { field: "expectedGraduation" },
    };
  }

  const tooEarly = rule.earliest !== undefined && position(graduation) < position(rule.earliest);
  const tooLate = rule.latest !== undefined && position(graduation) > position(rule.latest);

  return tooEarly || tooLate
    ? {
        criterion: "graduation_window",
        verdict: "ineligible",
        code: "GRADUATION_OUTSIDE_WINDOW",
        params: {},
      }
    : { criterion: "graduation_window", verdict: "eligible", code: "GRADUATION_WINDOW_OK", params: {} };
}
