import type { StudentProfile } from "@internradar/domain";
import { describe, expect, it } from "vitest";
import type { ProgramListItem } from "../../server/programs/list-programs";
import { eligibilityForFeed } from "./feed-eligibility";

const TODAY = "2026-10-03";

const PROFILE: StudentProfile = {
  expectedGraduation: { year: 2026, month: 11 },
  degreeLevel: "undergraduate",
  disciplines: ["computer_science"],
  citizenship: "au_citizen",
};

function program(id: string, overrides: Partial<ProgramListItem> = {}): ProgramListItem {
  return {
    id,
    slug: id,
    name: `Program ${id}`,
    programType: "graduate",
    cities: ["melbourne"],
    disciplines: [],
    sourceUrl: "https://example.com/x",
    company: { slug: "example-co", name: "Example Co", careersUrl: "https://example.com" },
    status: "open",
    windows: [],
    eligibilityRules: { schemaVersion: 1, citizenship: { allowed: ["au_citizen"] } },
    rulesVerified: true,
    rulesVersion: 1,
    ...overrides,
  };
}

describe("eligibilityForFeed", () => {
  it("gives every program an answer, keyed by its id", () => {
    const result = eligibilityForFeed([program("a"), program("b")], PROFILE, TODAY);

    expect(Object.keys(result).sort()).toEqual(["a", "b"]);
  });

  it("says eligible, with the reasons, when the student meets the verified rules", () => {
    const result = eligibilityForFeed([program("a")], PROFILE, TODAY);

    expect(result["a"]?.verdict).toBe("eligible");
    expect(result["a"]?.reasons.map((reason) => reason.code)).toContain("CITIZENSHIP_OK");
  });

  it("says not eligible when they do not", () => {
    const nz = { ...PROFILE, citizenship: "nz_citizen" as const };

    expect(eligibilityForFeed([program("a")], nz, TODAY)["a"]?.verdict).toBe("ineligible");
  });

  it("says 'check requirements', never a guess, while the rules are unverified", () => {
    const result = eligibilityForFeed([program("a", { rulesVerified: false })], PROFILE, TODAY);

    expect(result["a"]?.verdict).toBe("unknown");
    expect(result["a"]?.reasons.map((reason) => reason.code)).toEqual(["RULES_UNVERIFIED"]);
  });

  it("says 'check requirements' for a rule the student has not given us the answer to", () => {
    const result = eligibilityForFeed([program("a")], { ...PROFILE, citizenship: null }, TODAY);

    expect(result["a"]?.verdict).toBe("unknown");
  });

  it("answers each program on its own: one bad program never spoils the rest", () => {
    const broken = program("bad", { eligibilityRules: { schemaVersion: 99 } });

    const result = eligibilityForFeed([broken, program("good")], PROFILE, TODAY);

    expect(result["bad"]?.verdict).toBe("unknown");
    expect(result["good"]?.verdict).toBe("eligible");
  });

  it("judges year level against the program's own live window", () => {
    const summer = program("summer", {
      programType: "vacationer",
      eligibilityRules: { schemaVersion: 1, yearLevel: { preset: "penultimate" } },
      windows: [
        {
          cycleYear: 2026,
          windowSeq: 1,
          opensOn: null,
          opensPrecision: null,
          closesOn: null,
          closesPrecision: null,
          programStartsOn: "2026-11-01",
          programEndsOn: "2027-02-01",
          status: "upcoming",
          sourceUrl: "https://example.com/w",
        },
      ],
    });
    const student = { ...PROFILE, expectedGraduation: { year: 2027, month: 11 } as const };

    expect(eligibilityForFeed([summer], student, TODAY)["summer"]?.verdict).toBe("eligible");
  });

  it("returns nothing for an empty feed", () => {
    expect(eligibilityForFeed([], PROFILE, TODAY)).toEqual({});
  });
});
