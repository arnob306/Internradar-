import {
  CITIZENSHIPS,
  DEGREE_LEVELS,
  isDiscipline,
  type Month,
  type StudentProfile,
  type YearMonth,
} from "@internradar/domain";
import type { ProfileInput } from "../../features/profile/profile-input";
import type { Tables, TablesInsert } from "../db/database.types";

export type ProfileRow = Tables<"profiles">;

/** The columns a profile page reads: the student's own answers, not the bookkeeping. */
export const PROFILE_COLUMNS =
  "expected_graduation, degree_level, disciplines, is_double_degree, planning_honours, citizenship, university, email_alerts";

export type StoredProfile = Pick<
  ProfileRow,
  | "expected_graduation"
  | "degree_level"
  | "disciplines"
  | "is_double_degree"
  | "planning_honours"
  | "citizenship"
  | "university"
  | "email_alerts"
>;

function toDate(graduation: YearMonth | null): string | null {
  if (graduation === null) {
    return null;
  }
  // The table keeps month precision as the first of the month (decision D4, ADR-015).
  return `${String(graduation.year).padStart(4, "0")}-${String(graduation.month).padStart(2, "0")}-01`;
}

function fromDate(value: string | null): YearMonth | null {
  const match = value === null ? null : /^(\d{4})-(\d{2})-\d{2}$/.exec(value);
  if (match === null || match[1] === undefined || match[2] === undefined) {
    return null;
  }
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? { year: Number(match[1]), month: month as Month } : null;
}

function oneOf<T extends string>(options: readonly T[], value: string | null): T | null {
  return options.find((option) => option === value) ?? null;
}

/** A profile as the table stores it, owned by the given user. */
export function toProfileRow(userId: string, input: ProfileInput): TablesInsert<"profiles"> {
  return {
    user_id: userId,
    expected_graduation: toDate(input.expectedGraduation),
    degree_level: input.degreeLevel,
    disciplines: [...input.disciplines],
    is_double_degree: input.isDoubleDegree,
    planning_honours: input.planningHonours,
    citizenship: input.citizenship,
    university: input.university,
    email_alerts: input.emailAlerts,
  };
}

/**
 * A stored profile as the form shape. The database outlives the app's vocabulary, so whatever
 * is not recognised (a retired degree area, an unknown level, an unreadable date) is treated as
 * "not told us" and left out. One odd value must never stop someone loading their own profile.
 */
export function fromProfileRow(row: StoredProfile): ProfileInput {
  return {
    expectedGraduation: fromDate(row.expected_graduation),
    degreeLevel: oneOf(DEGREE_LEVELS, row.degree_level),
    disciplines: row.disciplines.filter(isDiscipline),
    isDoubleDegree: row.is_double_degree,
    planningHonours: row.planning_honours,
    citizenship: oneOf(CITIZENSHIPS, row.citizenship),
    university: row.university,
    emailAlerts: row.email_alerts,
  };
}

/**
 * What the eligibility engine is given: only the four things it judges. The university, the
 * alert setting and the rest never reach it, and citizenship, which is sensitive (decision D3),
 * goes no further than the engine.
 */
export function toStudentProfile(input: ProfileInput): StudentProfile {
  return {
    expectedGraduation: input.expectedGraduation,
    degreeLevel: input.degreeLevel,
    disciplines: input.disciplines,
    citizenship: input.citizenship,
  };
}
