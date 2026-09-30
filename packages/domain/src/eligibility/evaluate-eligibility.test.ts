import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Month, YearMonth } from "../academic-calendar/semesters";
import { ENGINE_VERSION, evaluateEligibility } from "./evaluate-eligibility";
import type { EligibilityRules, StudentProfile, WindowContext } from "./rules";
import type { Citizenship, DegreeLevel, Discipline } from "./vocabulary";

const ym = (year: number, month: Month): YearMonth => ({ year, month });

// A summer internship, November 2026 to February 2027. Rules are verified unless a test says not.
const CONTEXT: WindowContext = {
  programType: "internship",
  cycleYear: 2026,
  programStart: ym(2026, 11),
  programEnd: ym(2027, 2),
  rulesVerified: true,
  rulesVersion: 3,
};

// A penultimate-year Australian computer science undergraduate: passes everything below.
const STUDENT: StudentProfile = {
  expectedGraduation: ym(2027, 11),
  degreeLevel: "undergraduate",
  disciplines: ["computer_science"],
  citizenship: "au_citizen",
};

const RULES: EligibilityRules = {
  schemaVersion: 1,
  yearLevel: { preset: "penultimate" },
  graduationWindow: { earliest: ym(2027, 1), latest: ym(2027, 12) },
  citizenship: { allowed: ["au_citizen", "au_pr"] },
  disciplines: { anyOf: ["stem_any"] },
  degreeLevels: { allowed: ["undergraduate", "masters_coursework"] },
};

const codes = (result: { reasons: readonly { code: string }[] }): string[] =>
  result.reasons.map((r) => r.code);

describe("combining criteria", () => {
  it("is eligible when every criterion passes, and lists every reason in a fixed order", () => {
    const result = evaluateEligibility(RULES, STUDENT, CONTEXT);

    expect(result.verdict).toBe("eligible");
    expect(codes(result)).toEqual([
      "YEAR_LEVEL_OK",
      "GRADUATION_WINDOW_OK",
      "CITIZENSHIP_OK",
      "DISCIPLINE_OK",
      "DEGREE_LEVEL_OK",
    ]);
  });

  it("is ineligible when one criterion fails", () => {
    const result = evaluateEligibility(RULES, { ...STUDENT, citizenship: "intl_student" }, CONTEXT);

    expect(result.verdict).toBe("ineligible");
    expect(codes(result)).toContain("CITIZENSHIP_NOT_ALLOWED");
  });

  it("lists every failing criterion, not just the first, in a fixed order", () => {
    const profile: StudentProfile = { ...STUDENT, expectedGraduation: ym(2028, 11), citizenship: "other" };

    const result = evaluateEligibility(RULES, profile, CONTEXT);

    expect(result.verdict).toBe("ineligible");
    expect(
      codes(result).filter((c) =>
        ["SEMESTERS_REMAINING_OUT_OF_RANGE", "GRADUATION_OUTSIDE_WINDOW", "CITIZENSHIP_NOT_ALLOWED"].includes(c),
      ),
    ).toEqual(["SEMESTERS_REMAINING_OUT_OF_RANGE", "GRADUATION_OUTSIDE_WINDOW", "CITIZENSHIP_NOT_ALLOWED"]);
  });

  it("is unknown when nothing fails but something is unknown", () => {
    const result = evaluateEligibility(RULES, { ...STUDENT, citizenship: null }, CONTEXT);

    expect(result.verdict).toBe("unknown");
    expect(codes(result)).toContain("PROFILE_INCOMPLETE");
  });

  it("ineligible beats unknown, and both reasons are listed", () => {
    const profile: StudentProfile = { ...STUDENT, expectedGraduation: ym(2028, 11), citizenship: null };

    const result = evaluateEligibility(RULES, profile, CONTEXT);

    expect(result.verdict).toBe("ineligible");
    expect(codes(result)).toEqual(
      expect.arrayContaining(["SEMESTERS_REMAINING_OUT_OF_RANGE", "PROFILE_INCOMPLETE"]),
    );
  });

  it("an empty profile gives unknown, with a reason for every constrained criterion", () => {
    const empty: StudentProfile = { expectedGraduation: null, degreeLevel: null, disciplines: [], citizenship: null };

    const result = evaluateEligibility(RULES, empty, CONTEXT);

    expect(result.verdict).toBe("unknown");
    expect(result.reasons.map((r) => r.criterion)).toEqual([
      "year_level",
      "graduation_window",
      "citizenship",
      "discipline",
      "degree_level",
    ]);
    expect(result.reasons.every((r) => r.verdict === "unknown")).toBe(true);
  });

  it("only evaluates the criteria a rule names", () => {
    const rules: EligibilityRules = { schemaVersion: 1, citizenship: { allowed: ["au_citizen"] } };
    const profile: StudentProfile = { ...STUDENT, expectedGraduation: null, disciplines: [] };

    const result = evaluateEligibility(rules, profile, CONTEXT);

    expect(result.verdict).toBe("eligible");
    expect(result.reasons.map((r) => r.criterion)).toEqual(["citizenship"]);
  });

  it("a verified program with no restrictions is eligible for everyone", () => {
    const empty: StudentProfile = { expectedGraduation: null, degreeLevel: null, disciplines: [], citizenship: null };

    const result = evaluateEligibility({ schemaVersion: 1 }, empty, CONTEXT);

    expect(result).toMatchObject({ verdict: "eligible", reasons: [] });
  });

  it("passes acceptsMidYearGraduates through to the year-level rule", () => {
    const profile: StudentProfile = { ...STUDENT, expectedGraduation: ym(2027, 6) };
    const yearOnly: EligibilityRules = { schemaVersion: 1, yearLevel: { preset: "penultimate" } };

    expect(evaluateEligibility(yearOnly, profile, CONTEXT).verdict).toBe("unknown");
    expect(
      evaluateEligibility({ ...yearOnly, acceptsMidYearGraduates: true }, profile, CONTEXT).verdict,
    ).toBe("eligible");
  });
});

describe("unverified rules", () => {
  const UNVERIFIED: WindowContext = { ...CONTEXT, rulesVerified: false };

  it("gives unknown even when every criterion passes", () => {
    const result = evaluateEligibility(RULES, STUDENT, UNVERIFIED);

    expect(result.verdict).toBe("unknown");
    expect(result.reasons[0]).toMatchObject({ criterion: "rules", code: "RULES_UNVERIFIED" });
  });

  it("gives unknown even when a criterion fails, because the rules cannot be trusted", () => {
    const result = evaluateEligibility(RULES, { ...STUDENT, citizenship: "other" }, UNVERIFIED);

    expect(result.verdict).toBe("unknown");
    expect(codes(result)).toContain("CITIZENSHIP_NOT_ALLOWED");
  });

  it("gives unknown for empty rules too, since nothing has been checked", () => {
    expect(evaluateEligibility({ schemaVersion: 1 }, STUDENT, UNVERIFIED).verdict).toBe("unknown");
  });
});

describe("audit information and purity", () => {
  it("records the rules version and the engine version", () => {
    const result = evaluateEligibility(RULES, STUDENT, CONTEXT);

    expect(result).toMatchObject({ rulesVersion: 3, engineVersion: ENGINE_VERSION });
  });

  it("does not change its inputs and is deterministic", () => {
    const rules = Object.freeze({ ...RULES });
    const profile = Object.freeze({ ...STUDENT, disciplines: Object.freeze([...STUDENT.disciplines]) });
    const context = Object.freeze({ ...CONTEXT });

    const first = evaluateEligibility(rules, profile, context);

    expect(evaluateEligibility(rules, profile, context)).toEqual(first);
  });
});

describe("properties", () => {
  const month = fc.constantFrom<Month>(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12);
  const graduation = fc.option(fc.record({ year: fc.integer({ min: 2026, max: 2032 }), month }), { nil: null });
  const degreeLevel = fc.option(
    fc.constantFrom<DegreeLevel>("undergraduate", "honours", "masters_coursework", "masters_research", "phd"),
    { nil: null },
  );
  const disciplines = fc.subarray<Discipline>(["computer_science", "law", "economics", "physics", "accounting"]);
  const citizenship = fc.option(
    fc.constantFrom<Citizenship>("au_citizen", "au_pr", "nz_citizen", "intl_student", "other"),
    { nil: null },
  );
  const profile = fc.record({ expectedGraduation: graduation, degreeLevel, disciplines, citizenship });
  const rank = { ineligible: 0, unknown: 1, eligible: 2 } as const;

  it("blanking a known profile field never turns a 'no' or 'unknown' into a 'yes', or a 'yes' into a 'no'", () => {
    fc.assert(
      fc.property(
        profile,
        fc.constantFrom("expectedGraduation", "degreeLevel", "citizenship"),
        (p, field) => {
          const known = evaluateEligibility(RULES, p, CONTEXT).verdict;
          const blanked = evaluateEligibility(RULES, { ...p, [field]: null }, CONTEXT).verdict;

          expect(blanked === "eligible" && known !== "eligible").toBe(false);
          expect(known === "eligible" && blanked === "ineligible").toBe(false);
        },
      ),
    );
  });

  it("allowing more citizenships never makes the answer worse", () => {
    const allowedSet = fc.subarray<Citizenship>(["au_citizen", "au_pr", "nz_citizen", "intl_student", "other"]);
    fc.assert(
      fc.property(profile, allowedSet, allowedSet, (p, a, b) => {
        const narrow = { ...RULES, citizenship: { allowed: a } };
        const wide = { ...RULES, citizenship: { allowed: [...new Set([...a, ...b])] } };

        const before = evaluateEligibility(narrow, p, CONTEXT).verdict;
        const after = evaluateEligibility(wide, p, CONTEXT).verdict;

        expect(rank[after]).toBeGreaterThanOrEqual(rank[before]);
      }),
    );
  });

  it("is deterministic", () => {
    fc.assert(
      fc.property(profile, (p) => {
        expect(evaluateEligibility(RULES, p, CONTEXT)).toEqual(evaluateEligibility(RULES, p, CONTEXT));
      }),
    );
  });
});
