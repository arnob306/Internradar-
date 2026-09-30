import type { YearMonth } from "../academic-calendar/semesters";
import type { GraduationWindowRule } from "./graduation-window";
import type { CitizenshipRule, DegreeLevelRule, DisciplineRule } from "./profile-criteria";
import type { ProgramWindow } from "./program-dates";
import type { Citizenship, DegreeLevel, Discipline } from "./vocabulary";
import type { YearLevelRule } from "./year-level";

/**
 * What a program requires. Every field is optional: a missing field means "no restriction
 * of that kind", and it is not evaluated. Stored as JSON on the program.
 */
export interface EligibilityRules {
  readonly schemaVersion: 1;
  readonly yearLevel?: YearLevelRule | undefined;
  readonly graduationWindow?: GraduationWindowRule | undefined;
  readonly citizenship?: CitizenshipRule | undefined;
  readonly disciplines?: DisciplineRule | undefined;
  readonly degreeLevels?: DegreeLevelRule | undefined;
  /** Resolves the "one semester left" case for presets that count semesters. */
  readonly acceptsMidYearGraduates?: boolean | undefined;
}

/** What we know about a student. A null or empty field means they have not told us. */
export interface StudentProfile {
  /** Completion of the LAST degree they will do, at month precision (decision D4). */
  readonly expectedGraduation: YearMonth | null;
  readonly degreeLevel: DegreeLevel | null;
  /** The union across a double degree. */
  readonly disciplines: readonly Discipline[];
  /** Optional and sensitive (decision D3). */
  readonly citizenship: Citizenship | null;
}

/** The program window the student is being judged against. */
export interface WindowContext extends ProgramWindow {
  /** False until a person has checked the rules; the engine then answers "unknown". */
  readonly rulesVerified: boolean;
  readonly rulesVersion: number;
}
