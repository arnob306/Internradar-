import { describe, expect, it } from "vitest";
import {
  evaluateCitizenship,
  evaluateDegreeLevel,
  evaluateDiscipline,
} from "./profile-criteria";
import type { Citizenship, Discipline } from "./vocabulary";

const AU_ONLY = ["au_citizen"] as const;
const AU_OR_PR = ["au_citizen", "au_pr"] as const;
const AU_PR_OR_NZ = ["au_citizen", "au_pr", "nz_citizen"] as const;

describe("evaluateCitizenship", () => {
  // Rows: rule, then the verdict for each profile value (D3: null is unknown).
  it.each([
    ["au_citizen only", AU_ONLY, { au_citizen: "eligible", au_pr: "ineligible", nz_citizen: "ineligible", intl_student: "ineligible", other: "ineligible" }],
    ["citizens and PR", AU_OR_PR, { au_citizen: "eligible", au_pr: "eligible", nz_citizen: "ineligible", intl_student: "ineligible", other: "ineligible" }],
    ["citizens, PR and NZ", AU_PR_OR_NZ, { au_citizen: "eligible", au_pr: "eligible", nz_citizen: "eligible", intl_student: "ineligible", other: "ineligible" }],
  ] as const)("%s", (_label, allowed, expected) => {
    for (const [citizenship, verdict] of Object.entries(expected)) {
      const result = evaluateCitizenship({ allowed }, citizenship as Citizenship);

      expect(result, citizenship).toMatchObject({ criterion: "citizenship", verdict });
    }
  });

  it("gives specific reason codes", () => {
    expect(evaluateCitizenship({ allowed: AU_ONLY }, "au_citizen").code).toBe("CITIZENSHIP_OK");
    expect(evaluateCitizenship({ allowed: AU_ONLY }, "au_pr").code).toBe("CITIZENSHIP_NOT_ALLOWED");
  });

  it("never treats NZ citizens as permanent residents unless the rule lists them", () => {
    expect(evaluateCitizenship({ allowed: AU_OR_PR }, "nz_citizen").verdict).toBe("ineligible");
  });

  it("is unknown when citizenship was not given, whatever the rule", () => {
    for (const allowed of [AU_ONLY, AU_OR_PR, AU_PR_OR_NZ]) {
      expect(evaluateCitizenship({ allowed }, null)).toMatchObject({
        verdict: "unknown",
        code: "PROFILE_INCOMPLETE",
      });
    }
  });

  it("an empty allowed list matches nobody", () => {
    expect(evaluateCitizenship({ allowed: [] }, "au_citizen").verdict).toBe("ineligible");
  });

  // Decision D3: citizenship is sensitive and must not leak into logs or metrics.
  it("does not carry the citizenship value in its result", () => {
    const result = evaluateCitizenship({ allowed: AU_ONLY }, "nz_citizen");

    expect(JSON.stringify(result)).not.toContain("nz_citizen");
  });
});

describe("evaluateDiscipline", () => {
  it.each([
    ["a matching term", ["computer_science"], ["computer_science", "engineering_other"], "eligible", "DISCIPLINE_OK"],
    ["no matching term", ["law"], ["engineering_other"], "ineligible", "DISCIPLINE_MISMATCH"],
    ["a double degree matching one side", ["commerce_finance", "law"], ["law"], "eligible", "DISCIPLINE_OK"],
    ["a double degree matching neither side", ["commerce_finance", "law"], ["engineering_other", "science_other"], "ineligible", "DISCIPLINE_MISMATCH"],
    ["a group the student belongs to", ["mathematics_statistics"], ["stem_any"], "eligible", "DISCIPLINE_OK"],
    ["a group the student is outside", ["economics"], ["stem_any"], "ineligible", "DISCIPLINE_MISMATCH"],
    ["an empty rule matches nothing", ["computer_science"], [], "ineligible", "DISCIPLINE_MISMATCH"],
  ] as const)("%s", (_label, disciplines, anyOf, verdict, code) => {
    const result = evaluateDiscipline({ anyOf }, disciplines as readonly Discipline[]);

    expect(result).toMatchObject({ criterion: "discipline", verdict, code });
  });

  it("is unknown when the student has not said what they study", () => {
    const result = evaluateDiscipline({ anyOf: ["computer_science"] }, []);

    expect(result).toMatchObject({ verdict: "unknown", code: "PROFILE_INCOMPLETE" });
  });

  it("does not change its inputs", () => {
    const rule = Object.freeze({ anyOf: Object.freeze(["stem_any"] as const) });
    const disciplines = Object.freeze(["law"] as const);

    expect(evaluateDiscipline(rule, disciplines).verdict).toBe("ineligible");
  });
});

describe("evaluateDegreeLevel", () => {
  const rule = { allowed: ["undergraduate", "masters_coursework"] } as const;

  it.each([
    ["undergraduate", "eligible", "DEGREE_LEVEL_OK"],
    ["masters_coursework", "eligible", "DEGREE_LEVEL_OK"],
    ["phd", "ineligible", "DEGREE_LEVEL_NOT_ALLOWED"],
    ["honours", "ineligible", "DEGREE_LEVEL_NOT_ALLOWED"],
  ] as const)("%s", (level, verdict, code) => {
    expect(evaluateDegreeLevel(rule, level)).toMatchObject({ criterion: "degree_level", verdict, code });
  });

  it("is unknown when the degree level was not given", () => {
    expect(evaluateDegreeLevel(rule, null)).toMatchObject({
      verdict: "unknown",
      code: "PROFILE_INCOMPLETE",
    });
  });
});
