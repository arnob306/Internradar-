import { describe, expect, it } from "vitest";
import type { Month, YearMonth } from "../academic-calendar/semesters";
import type { ProgramWindow } from "./program-dates";
import { evaluateYearLevel, type YearLevelInput, type YearLevelRule } from "./year-level";

const ym = (year: number, month: Month): YearMonth => ({ year, month });

// A summer internship, November 2026 to February 2027. Presets are measured at its end.
const SUMMER_INTERNSHIP: ProgramWindow = {
  programType: "internship",
  cycleYear: 2026,
  programStart: ym(2026, 11),
  programEnd: ym(2027, 2),
};
// A graduate program starting February 2027. `final_year` is measured at its start.
const GRADUATE_PROGRAM: ProgramWindow = {
  programType: "graduate",
  cycleYear: 2027,
  programStart: ym(2027, 2),
  programEnd: null,
};

function input(overrides: Partial<YearLevelInput> & Pick<YearLevelInput, "rule">): YearLevelInput {
  return {
    acceptsMidYearGraduates: false,
    expectedGraduation: ym(2027, 11),
    window: SUMMER_INTERNSHIP,
    ...overrides,
  };
}

const PENULTIMATE: YearLevelRule = { preset: "penultimate" };
const PRE_PENULTIMATE: YearLevelRule = { preset: "pre_penultimate" };
const FINAL_YEAR: YearLevelRule = { preset: "final_year" };

describe("penultimate preset (measured at program end)", () => {
  it.each([
    ["two semesters left", ym(2027, 11), false, "eligible", "YEAR_LEVEL_OK", 2],
    ["January graduate counts as the previous S2", ym(2028, 1), false, "eligible", "YEAR_LEVEL_OK", 2],
    ["mid-year graduate is unknown", ym(2027, 6), false, "unknown", "MID_YEAR_GRADUATE_CHECK_EMPLOYER", 1],
    ["mid-year graduate accepted by the program", ym(2027, 6), true, "eligible", "YEAR_LEVEL_OK", 1],
    ["three semesters left is off-cycle", ym(2028, 6), false, "unknown", "OFF_CYCLE_GRADUATION_CHECK_EMPLOYER", 3],
    ["four semesters left is too early", ym(2028, 11), false, "ineligible", "SEMESTERS_REMAINING_OUT_OF_RANGE", 4],
    ["already finished is too late", ym(2026, 11), false, "ineligible", "SEMESTERS_REMAINING_OUT_OF_RANGE", 0],
  ] as const)("%s", (_label, graduation, acceptsMidYear, verdict, code, semesters) => {
    const result = evaluateYearLevel(
      input({ rule: PENULTIMATE, expectedGraduation: graduation, acceptsMidYearGraduates: acceptsMidYear }),
    );

    expect(result).toMatchObject({ criterion: "year_level", verdict, code, params: { semesters } });
  });
});

describe("pre_penultimate preset (discovery programs, measured at program end)", () => {
  it.each([
    ["four semesters left", ym(2028, 11), "eligible", "YEAR_LEVEL_OK", 4],
    ["six semesters left", ym(2029, 11), "eligible", "YEAR_LEVEL_OK", 6],
    ["three semesters left is off-cycle", ym(2028, 6), "unknown", "OFF_CYCLE_GRADUATION_CHECK_EMPLOYER", 3],
    ["two semesters left is too late", ym(2027, 11), "ineligible", "SEMESTERS_REMAINING_OUT_OF_RANGE", 2],
    ["one semester left is too late", ym(2027, 6), "ineligible", "SEMESTERS_REMAINING_OUT_OF_RANGE", 1],
  ] as const)("%s", (_label, graduation, verdict, code, semesters) => {
    const result = evaluateYearLevel(input({ rule: PRE_PENULTIMATE, expectedGraduation: graduation }));

    expect(result).toMatchObject({ verdict, code, params: { semesters } });
  });
});

describe("final_year preset (measured at program start)", () => {
  it.each([
    ["one semester left", ym(2027, 6), "eligible", "YEAR_LEVEL_OK", 1],
    ["nothing left", ym(2026, 11), "eligible", "YEAR_LEVEL_OK", 0],
    ["two semesters left", ym(2027, 11), "ineligible", "SEMESTERS_REMAINING_OUT_OF_RANGE", 2],
  ] as const)("%s", (_label, graduation, verdict, code, semesters) => {
    const result = evaluateYearLevel(
      input({ rule: FINAL_YEAR, expectedGraduation: graduation, window: GRADUATE_PROGRAM }),
    );

    expect(result).toMatchObject({
      verdict,
      code,
      params: { semesters, measuredAt: "program_start" },
    });
  });
});

describe("explicit semester bounds", () => {
  it("accepts a count inside the bounds, inclusive at both ends", () => {
    const rule: YearLevelRule = { minSemestersRemaining: 2, maxSemestersRemaining: 3, measuredAt: "program_end" };

    const results = [ym(2027, 11), ym(2028, 6)].map((g) =>
      evaluateYearLevel(input({ rule, expectedGraduation: g })).verdict,
    );

    expect(results).toEqual(["eligible", "eligible"]);
  });

  it("rejects a count outside the bounds", () => {
    const rule: YearLevelRule = { minSemestersRemaining: 2, maxSemestersRemaining: 3, measuredAt: "program_end" };

    const results = [ym(2027, 6), ym(2028, 11)].map((g) =>
      evaluateYearLevel(input({ rule, expectedGraduation: g })).verdict,
    );

    expect(results).toEqual(["ineligible", "ineligible"]);
  });

  it("measures at the start or the end of the program, as the rule says", () => {
    // A June to September placement: S2 2026 is still to start at the beginning, but has
    // begun by the end. Graduating November 2027 leaves 3 semesters from June, 2 from September.
    const window: ProgramWindow = {
      programType: "internship",
      cycleYear: 2026,
      programStart: ym(2026, 6),
      programEnd: ym(2026, 9),
    };
    const at = (measuredAt: "program_start" | "program_end") =>
      evaluateYearLevel(
        input({
          rule: { minSemestersRemaining: 3, measuredAt },
          expectedGraduation: ym(2027, 11),
          window,
        }),
      );

    expect(at("program_start")).toMatchObject({ verdict: "eligible", params: { semesters: 3 } });
    expect(at("program_end")).toMatchObject({ verdict: "ineligible", params: { semesters: 2 } });
  });

  it("with no bounds at all, imposes no constraint", () => {
    const rule: YearLevelRule = { measuredAt: "program_end" };

    expect(evaluateYearLevel(input({ rule, expectedGraduation: ym(2035, 11) })).verdict).toBe("eligible");
  });
});

describe("missing information gives unknown, never a guess", () => {
  it("is unknown without a graduation date", () => {
    const result = evaluateYearLevel(input({ rule: PENULTIMATE, expectedGraduation: null }));

    expect(result).toMatchObject({ verdict: "unknown", code: "PROFILE_INCOMPLETE" });
  });

  it("is unknown when the program has no dates and no sound default", () => {
    const window: ProgramWindow = { programType: "cadetship", cycleYear: 2027, programStart: null, programEnd: null };

    const result = evaluateYearLevel(input({ rule: PENULTIMATE, window }));

    expect(result).toMatchObject({ verdict: "unknown", code: "PROGRAM_DATES_MISSING" });
  });

  it("reports when the program dates were assumed from its type", () => {
    const window: ProgramWindow = { programType: "internship", cycleYear: 2026, programStart: null, programEnd: null };

    const result = evaluateYearLevel(input({ rule: PENULTIMATE, window }));

    expect(result).toMatchObject({ verdict: "eligible", params: { assumedProgramDates: true } });
  });

  it("does not flag assumed dates when the program gave its own", () => {
    const result = evaluateYearLevel(input({ rule: PENULTIMATE }));

    expect(result.params).not.toHaveProperty("assumedProgramDates", true);
  });
});

describe("evaluateYearLevel purity", () => {
  it("does not change its input", () => {
    const frozen = Object.freeze({
      rule: Object.freeze({ preset: "penultimate" }) as YearLevelRule,
      acceptsMidYearGraduates: false,
      expectedGraduation: Object.freeze(ym(2027, 11)),
      window: Object.freeze({ ...SUMMER_INTERNSHIP }),
    }) as YearLevelInput;

    expect(evaluateYearLevel(frozen).verdict).toBe("eligible");
    expect(evaluateYearLevel(frozen)).toEqual(evaluateYearLevel(frozen));
  });
});
