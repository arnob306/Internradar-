import type { YearMonth } from "../academic-calendar/semesters";
import { monthPosition } from "../academic-calendar/year-month";
import type { CriterionResult } from "./types";

/** Both ends are optional and inclusive, at month precision. */
export interface GraduationWindowRule {
  readonly earliest?: YearMonth | undefined;
  readonly latest?: YearMonth | undefined;
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

  const tooEarly =
    rule.earliest !== undefined && monthPosition(graduation) < monthPosition(rule.earliest);
  const tooLate =
    rule.latest !== undefined && monthPosition(graduation) > monthPosition(rule.latest);

  return tooEarly || tooLate
    ? {
        criterion: "graduation_window",
        verdict: "ineligible",
        code: "GRADUATION_OUTSIDE_WINDOW",
        params: {},
      }
    : { criterion: "graduation_window", verdict: "eligible", code: "GRADUATION_WINDOW_OK", params: {} };
}
