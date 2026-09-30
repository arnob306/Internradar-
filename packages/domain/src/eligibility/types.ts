/** The answer to "am I eligible?". Unknown is a first-class answer, never a guess. */
export type Verdict = "eligible" | "ineligible" | "unknown";

export type Criterion =
  | "rules"
  | "profile"
  | "year_level"
  | "graduation_window"
  | "citizenship"
  | "discipline"
  | "degree_level";

/** Stable codes. The UI renders text from a code and its params, never the reverse. */
export type ReasonCode =
  | "YEAR_LEVEL_OK"
  | "SEMESTERS_REMAINING_OUT_OF_RANGE"
  | "MID_YEAR_GRADUATE_CHECK_EMPLOYER"
  | "OFF_CYCLE_GRADUATION_CHECK_EMPLOYER"
  | "PROFILE_INCOMPLETE"
  | "PROGRAM_DATES_MISSING";

export type ReasonParams = Readonly<Record<string, string | number | boolean>>;

/** One criterion's verdict, with the reason and the numbers behind it. */
export interface CriterionResult {
  readonly criterion: Criterion;
  readonly verdict: Verdict;
  readonly code: ReasonCode;
  readonly params: ReasonParams;
}
