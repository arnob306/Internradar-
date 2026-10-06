import {
  CITIZENSHIPS,
  DEGREE_LEVELS,
  isDiscipline,
  type Citizenship,
  type DegreeLevel,
  type Discipline,
  type FieldError,
  type Month,
  type YearMonth,
} from "@internradar/domain";

/** What a student may save about themselves: the profile form's fields, validated. */
export interface ProfileInput {
  /** Completion of the LAST degree they will do, at month precision (decision D4). */
  readonly expectedGraduation: YearMonth | null;
  readonly degreeLevel: DegreeLevel | null;
  /** Real degree areas only; the "any STEM" group is for programs, not for people. */
  readonly disciplines: readonly Discipline[];
  readonly isDoubleDegree: boolean;
  readonly planningHonours: boolean;
  /** Optional and sensitive (decision D3). */
  readonly citizenship: Citizenship | null;
  readonly university: string | null;
  readonly emailAlerts: boolean;
}

export type ProfileInputResult =
  | { readonly ok: true; readonly value: ProfileInput }
  | { readonly ok: false; readonly fields: readonly FieldError[] };

const KEYS: ReadonlySet<string> = new Set([
  "expectedGraduation",
  "degreeLevel",
  "disciplines",
  "isDoubleDegree",
  "planningHonours",
  "citizenship",
  "university",
  "emailAlerts",
]);

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;
const MAX_DISCIPLINES = 6;
const MAX_UNIVERSITY_LENGTH = 120;
// Control characters have no place in a name, and are a classic way to smuggle odd text in.
function hasControlCharacters(text: string): boolean {
  return [...text].some((character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });
}

type Fail = (field: string, message: string) => void;
type Raw = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function graduation(value: unknown, fail: Fail): YearMonth | null {
  if (value === undefined || value === null) {
    return null;
  }
  const valid =
    isRecord(value) &&
    Object.keys(value).every((key) => key === "year" || key === "month") &&
    Number.isInteger(value["year"]) &&
    Number.isInteger(value["month"]) &&
    (value["year"] as number) >= MIN_YEAR &&
    (value["year"] as number) <= MAX_YEAR &&
    (value["month"] as number) >= 1 &&
    (value["month"] as number) <= 12;
  if (!valid) {
    fail("expectedGraduation", `expectedGraduation must be a year (${MIN_YEAR} to ${MAX_YEAR}) and a month (1 to 12).`);
    return null;
  }
  return { year: value["year"] as number, month: value["month"] as Month };
}

function oneOf<T extends string>(value: unknown, options: readonly T[], field: string, fail: Fail): T | null {
  if (value === undefined || value === null) {
    return null;
  }
  const match = options.find((option) => option === value);
  if (match === undefined) {
    fail(field, `${field} must be one of: ${options.join(", ")}.`);
    return null;
  }
  return match;
}

function disciplines(value: unknown, fail: Fail): readonly Discipline[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === "string")) {
    fail("disciplines", "disciplines must be a list of degree areas.");
    return [];
  }
  const unknown = value.filter((item) => !isDiscipline(item));
  if (unknown.length > 0) {
    fail("disciplines", "disciplines has a degree area that is not recognised.");
    return [];
  }
  const unique = [...new Set(value)] as Discipline[];
  if (unique.length > MAX_DISCIPLINES) {
    fail("disciplines", `disciplines can list at most ${MAX_DISCIPLINES} degree areas.`);
    return [];
  }
  return unique;
}

function flag(value: unknown, fallback: boolean, field: string, fail: Fail): boolean {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "boolean") {
    fail(field, `${field} must be true or false.`);
    return fallback;
  }
  return value;
}

function university(value: unknown, fail: Fail): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string" || hasControlCharacters(value) || value.trim().length > MAX_UNIVERSITY_LENGTH) {
    fail("university", `university must be plain text of at most ${MAX_UNIVERSITY_LENGTH} characters.`);
    return null;
  }
  return value.trim() === "" ? null : value.trim();
}

/**
 * Validate a profile as a student submits it. Missing fields mean "not told us yet" (alerts
 * default to on), so saving replaces the whole profile. Unknown keys are rejected, including
 * `user_id`: who the profile belongs to comes from the session, never from the request.
 */
export function parseProfileInput(body: unknown): ProfileInputResult {
  if (!isRecord(body)) {
    return { ok: false, fields: [{ field: "body", message: "The profile must be a JSON object." }] };
  }

  const errors: FieldError[] = [];
  const fail: Fail = (field, message) => {
    errors.push({ field, message });
  };

  for (const key of Object.keys(body)) {
    if (!KEYS.has(key)) {
      fail(key, `Unknown field "${key}".`);
    }
  }

  const value: ProfileInput = {
    expectedGraduation: graduation(body["expectedGraduation"], fail),
    degreeLevel: oneOf(body["degreeLevel"], DEGREE_LEVELS, "degreeLevel", fail),
    disciplines: disciplines(body["disciplines"], fail),
    isDoubleDegree: flag(body["isDoubleDegree"], false, "isDoubleDegree", fail),
    planningHonours: flag(body["planningHonours"], false, "planningHonours", fail),
    citizenship: oneOf(body["citizenship"], CITIZENSHIPS, "citizenship", fail),
    university: university(body["university"], fail),
    emailAlerts: flag(body["emailAlerts"], true, "emailAlerts", fail),
  };

  return errors.length > 0 ? { ok: false, fields: errors } : { ok: true, value };
}
