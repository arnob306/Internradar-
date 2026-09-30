export type { Month, Semester, Term, YearMonth } from "./academic-calendar/semesters";
export { finalSemester, semestersRemaining } from "./academic-calendar/semesters";
export { addMonths } from "./academic-calendar/year-month";
export type { Clock } from "./clock";
export { FixedClock } from "./clock";
export type {
  Envelope,
  ErrorBody,
  ErrorEnvelope,
  FieldError,
  PageMeta,
  SuccessEnvelope,
} from "./envelope";
export { fail, ok } from "./envelope";
export type {
  ProgramType,
  ProgramWindow,
  ResolvedProgramDates,
} from "./eligibility/program-dates";
export { resolveProgramDates } from "./eligibility/program-dates";
export type {
  Criterion,
  CriterionResult,
  ReasonCode,
  ReasonParams,
  Verdict,
} from "./eligibility/types";
export type {
  MeasuredAt,
  YearLevelInput,
  YearLevelPreset,
  YearLevelRule,
} from "./eligibility/year-level";
export { evaluateYearLevel } from "./eligibility/year-level";
