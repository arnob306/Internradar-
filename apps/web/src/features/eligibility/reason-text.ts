import type { ReasonCode, ReasonParams, Verdict } from "@internradar/domain";

/**
 * Plain-language text for the engine's stable codes. The engine returns a code and its
 * params; the UI renders words from them, never the other way round. The Record type makes
 * this exhaustive: a new ReasonCode in the domain package is a compile error until it has
 * text here.
 */

const FIELD_NAMES: Readonly<Record<string, string>> = {
  expectedGraduation: "expected graduation",
  citizenship: "citizenship",
  discipline: "degree area",
  degreeLevel: "degree level",
};

function missingField(params: ReasonParams): string {
  const field = params["field"];
  const name = typeof field === "string" ? FIELD_NAMES[field] : undefined;
  return name ?? "your profile";
}

const REASON_TEXT: Readonly<Record<ReasonCode, (params: ReasonParams) => string>> = {
  YEAR_LEVEL_OK: () => "Your year level matches what this program asks for.",
  SEMESTERS_REMAINING_OUT_OF_RANGE: () =>
    "This program is aimed at a different year of study than yours.",
  MID_YEAR_GRADUATE_CHECK_EMPLOYER: () =>
    "You graduate mid-year, which this program may or may not accept. Confirm with the employer.",
  OFF_CYCLE_GRADUATION_CHECK_EMPLOYER: () =>
    "Your graduation date falls outside the usual cycle. Confirm with the employer.",
  ALREADY_GRADUATED: () => "You have already graduated, and this program is for current students.",
  GRADUATION_WINDOW_OK: () => "Your graduation date is within the range this program accepts.",
  GRADUATION_OUTSIDE_WINDOW: () =>
    "Your graduation date is outside the range this program accepts.",
  CITIZENSHIP_OK: () => "Your citizenship or residency is accepted.",
  CITIZENSHIP_NOT_ALLOWED: () => "This program does not accept your citizenship or residency.",
  DISCIPLINE_OK: () => "Your degree area is one this program accepts.",
  DISCIPLINE_MISMATCH: () => "This program asks for a different degree area.",
  DEGREE_LEVEL_OK: () => "Your degree level is accepted.",
  DEGREE_LEVEL_NOT_ALLOWED: () => "This program does not accept your degree level.",
  RULES_UNVERIFIED: () =>
    "We haven't checked this program's requirements yet. Read them on the employer's page.",
  RULES_INVALID: () =>
    "We couldn't read this program's requirements. Read them on the employer's page.",
  PROFILE_INCOMPLETE: (params) => `Add ${missingField(params)} to your profile so we can check this.`,
  PROGRAM_DATES_MISSING: () =>
    "This program has no start date yet, so we can't work out your year level against it.",
};

export function reasonText(code: ReasonCode, params: ReasonParams): string {
  return REASON_TEXT[code](params);
}

const VERDICT_LABELS: Readonly<Record<Verdict, string>> = {
  eligible: "Eligible",
  ineligible: "Not eligible",
  unknown: "Check requirements",
};

export function verdictLabel(verdict: Verdict): string {
  return VERDICT_LABELS[verdict];
}
