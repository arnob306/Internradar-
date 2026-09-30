import type { Criterion, CriterionResult, ReasonCode } from "./types";
import {
  expandDisciplines,
  type Citizenship,
  type DegreeLevel,
  type Discipline,
  type DisciplineTerm,
} from "./vocabulary";

export interface CitizenshipRule {
  readonly allowed: readonly Citizenship[];
}

export interface DegreeLevelRule {
  readonly allowed: readonly DegreeLevel[];
}

export interface DisciplineRule {
  readonly anyOf: readonly DisciplineTerm[];
}

function profileIncomplete(criterion: Criterion, field: string): CriterionResult {
  return { criterion, verdict: "unknown", code: "PROFILE_INCOMPLETE", params: { field } };
}

/**
 * A profile value must be one of the allowed values. A missing value is "unknown", never
 * a guess. The result deliberately carries no profile value, so nothing sensitive can
 * reach a log or a metric through it.
 */
function evaluateAllowedValue<T extends string>(
  criterion: Criterion,
  field: string,
  allowed: readonly T[],
  value: T | null,
  codes: { readonly ok: ReasonCode; readonly notAllowed: ReasonCode },
): CriterionResult {
  if (value === null) {
    return profileIncomplete(criterion, field);
  }
  return allowed.includes(value)
    ? { criterion, verdict: "eligible", code: codes.ok, params: {} }
    : { criterion, verdict: "ineligible", code: codes.notAllowed, params: {} };
}

/** Decision D3: citizenship is optional. A blank one is "unknown", not "ineligible". */
export function evaluateCitizenship(
  rule: CitizenshipRule,
  citizenship: Citizenship | null,
): CriterionResult {
  return evaluateAllowedValue("citizenship", "citizenship", rule.allowed, citizenship, {
    ok: "CITIZENSHIP_OK",
    notAllowed: "CITIZENSHIP_NOT_ALLOWED",
  });
}

export function evaluateDegreeLevel(
  rule: DegreeLevelRule,
  degreeLevel: DegreeLevel | null,
): CriterionResult {
  return evaluateAllowedValue("degree_level", "degreeLevel", rule.allowed, degreeLevel, {
    ok: "DEGREE_LEVEL_OK",
    notAllowed: "DEGREE_LEVEL_NOT_ALLOWED",
  });
}

/**
 * A student matches if any of their disciplines is covered by the rule. A double degree
 * therefore matches if either half does.
 */
export function evaluateDiscipline(
  rule: DisciplineRule,
  disciplines: readonly Discipline[],
): CriterionResult {
  if (disciplines.length === 0) {
    return profileIncomplete("discipline", "disciplines");
  }
  const covered = expandDisciplines(rule.anyOf);
  const matched = disciplines.find((discipline) => covered.has(discipline));
  return matched === undefined
    ? { criterion: "discipline", verdict: "ineligible", code: "DISCIPLINE_MISMATCH", params: {} }
    : { criterion: "discipline", verdict: "eligible", code: "DISCIPLINE_OK", params: { matched } };
}
