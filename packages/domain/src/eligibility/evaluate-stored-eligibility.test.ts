import { describe, expect, it } from "vitest";
import type { Month, YearMonth } from "../academic-calendar/semesters";
import { evaluateEligibility, ENGINE_VERSION } from "./evaluate-eligibility";
import { evaluateStoredEligibility } from "./evaluate-stored-eligibility";
import type { StudentProfile, WindowContext } from "./rules";

const ym = (year: number, month: Month): YearMonth => ({ year, month });

const CONTEXT: WindowContext = {
  programType: "internship",
  cycleYear: 2026,
  programStart: ym(2026, 11),
  programEnd: ym(2027, 2),
  rulesVerified: true,
  rulesVersion: 4,
};

const STUDENT: StudentProfile = {
  expectedGraduation: ym(2027, 11),
  degreeLevel: "undergraduate",
  disciplines: ["computer_science"],
  citizenship: "au_citizen",
};

const GOOD_JSON = {
  schemaVersion: 1,
  yearLevel: { preset: "penultimate" },
  citizenship: { allowed: ["au_citizen"] },
  disciplines: { anyOf: ["stem_any"] },
};

// evaluateStoredEligibility is the safe entry point for rules read from the database. It
// never throws: a rule it cannot understand is "unknown", not a crashed request.
describe("evaluateStoredEligibility", () => {
  it("gives the same answer as the typed engine for good rules", () => {
    const stored = evaluateStoredEligibility(GOOD_JSON, STUDENT, CONTEXT);

    expect(stored).toEqual(evaluateEligibility(GOOD_JSON as never, STUDENT, CONTEXT));
    expect(stored.verdict).toBe("eligible");
  });

  it.each([
    ["null", null],
    ["a string", "rules"],
    ["an empty object", {}],
    ["an unknown discipline term", { schemaVersion: 1, disciplines: { anyOf: ["compsci"] } }],
    ["a citizenship rule with no list", { schemaVersion: 1, citizenship: {} }],
    ["an unknown field", { schemaVersion: 1, visaType: "482" }],
  ])("answers unknown, not a crash, for %s", (_label, raw) => {
    const result = evaluateStoredEligibility(raw, STUDENT, CONTEXT);

    expect(result.verdict).toBe("unknown");
    expect(result.reasons).toEqual([
      expect.objectContaining({ criterion: "rules", verdict: "unknown", code: "RULES_INVALID" }),
    ]);
  });

  it("says how many problems it found, without echoing the rule", () => {
    const result = evaluateStoredEligibility({ schemaVersion: 1, disciplines: { anyOf: ["compsci"] } }, STUDENT, CONTEXT);

    expect(result.reasons[0]?.params).toEqual({ issueCount: 1 });
  });

  it("records the rules and engine versions even when the rules are invalid", () => {
    const result = evaluateStoredEligibility(null, STUDENT, CONTEXT);

    expect(result).toMatchObject({ rulesVersion: 4, engineVersion: ENGINE_VERSION });
  });

  it("reports unverified, not invalid, when the program is unverified, and does not parse", () => {
    const result = evaluateStoredEligibility(null, STUDENT, { ...CONTEXT, rulesVerified: false });

    expect(result.reasons).toEqual([
      { criterion: "rules", verdict: "unknown", code: "RULES_UNVERIFIED", params: {} },
    ]);
  });
});
