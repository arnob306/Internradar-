import { evaluateGraduationWindow } from "./graduation-window";
import { evaluateCitizenship, evaluateDegreeLevel, evaluateDiscipline } from "./profile-criteria";
import type { EligibilityRules, StudentProfile, WindowContext } from "./rules";
import type { CriterionResult, Verdict } from "./types";
import { evaluateYearLevel } from "./year-level";

/** Recorded on every result so a stored answer can be traced to the code that gave it. */
export const ENGINE_VERSION = "1";

export interface EligibilityResult {
  readonly verdict: Verdict;
  /** One entry per criterion the rules name, in a fixed order, plus RULES_UNVERIFIED if it applies. */
  readonly reasons: readonly CriterionResult[];
  readonly rulesVersion: number;
  readonly engineVersion: string;
}

const RULES_UNVERIFIED: CriterionResult = {
  criterion: "rules",
  verdict: "unknown",
  code: "RULES_UNVERIFIED",
  params: {},
};

function evaluateCriteria(
  rules: EligibilityRules,
  profile: StudentProfile,
  context: WindowContext,
): CriterionResult[] {
  const results: CriterionResult[] = [];
  if (rules.yearLevel !== undefined) {
    results.push(
      evaluateYearLevel({
        rule: rules.yearLevel,
        acceptsMidYearGraduates: rules.acceptsMidYearGraduates ?? false,
        expectedGraduation: profile.expectedGraduation,
        window: context,
      }),
    );
  }
  if (rules.graduationWindow !== undefined) {
    results.push(evaluateGraduationWindow(rules.graduationWindow, profile.expectedGraduation));
  }
  if (rules.citizenship !== undefined) {
    results.push(evaluateCitizenship(rules.citizenship, profile.citizenship));
  }
  if (rules.disciplines !== undefined) {
    results.push(evaluateDiscipline(rules.disciplines, profile.disciplines));
  }
  if (rules.degreeLevels !== undefined) {
    results.push(evaluateDegreeLevel(rules.degreeLevels, profile.degreeLevel));
  }
  return results;
}

function combine(reasons: readonly CriterionResult[]): Verdict {
  if (reasons.some((r) => r.verdict === "ineligible")) return "ineligible";
  if (reasons.some((r) => r.verdict === "unknown")) return "unknown";
  return "eligible";
}

/**
 * Am I eligible? Ineligible beats unknown, and unknown beats eligible. If the rules have
 * not been verified the answer is always "unknown": a wrong "no" hides a program someone
 * could apply to, and a wrong "yes" wastes an application. The feed never shows a false
 * "eligible".
 */
export function evaluateEligibility(
  rules: EligibilityRules,
  profile: StudentProfile,
  context: WindowContext,
): EligibilityResult {
  const criteria = evaluateCriteria(rules, profile, context);
  const reasons = context.rulesVerified ? criteria : [RULES_UNVERIFIED, ...criteria];
  return {
    verdict: context.rulesVerified ? combine(criteria) : "unknown",
    reasons,
    rulesVersion: context.rulesVersion,
    engineVersion: ENGINE_VERSION,
  };
}
