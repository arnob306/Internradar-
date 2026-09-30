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
export type { EligibilityResult } from "./eligibility/evaluate-eligibility";
export { ENGINE_VERSION, evaluateEligibility } from "./eligibility/evaluate-eligibility";
export type { EligibilityRules, StudentProfile, WindowContext } from "./eligibility/rules";
export { evaluateStoredEligibility } from "./eligibility/evaluate-stored-eligibility";
export type { ParsedRules } from "./eligibility/rules.schema";
export { eligibilityRulesSchema, parseEligibilityRules } from "./eligibility/rules.schema";
export type { GraduationWindowRule } from "./eligibility/graduation-window";
export { evaluateGraduationWindow } from "./eligibility/graduation-window";
export type {
  CitizenshipRule,
  DegreeLevelRule,
  DisciplineRule,
} from "./eligibility/profile-criteria";
export {
  evaluateCitizenship,
  evaluateDegreeLevel,
  evaluateDiscipline,
} from "./eligibility/profile-criteria";
export type {
  Citizenship,
  DegreeLevel,
  Discipline,
  DisciplineGroup,
  DisciplineTerm,
} from "./eligibility/vocabulary";
export {
  DISCIPLINE_GROUPS,
  DISCIPLINES,
  expandDisciplines,
  isDiscipline,
} from "./eligibility/vocabulary";
