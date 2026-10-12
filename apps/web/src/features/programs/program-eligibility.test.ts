import type { StudentProfile } from "@internradar/domain";
import { describe, expect, it } from "vitest";
import { evaluateProgram, type EligibilityInput, type EligibilityWindow } from "./program-eligibility";

const TODAY = "2026-10-03";

const PROFILE: StudentProfile = {
  expectedGraduation: { year: 2026, month: 11 },
  degreeLevel: "undergraduate",
  disciplines: ["computer_science"],
  citizenship: "au_citizen",
};

function window(overrides: Partial<EligibilityWindow> = {}): EligibilityWindow {
  return { cycleYear: 2027, programStartsOn: null, programEndsOn: null, status: "unknown", ...overrides };
}

function program(overrides: Partial<EligibilityInput> = {}): EligibilityInput {
  return {
    programType: "graduate",
    windows: [window()],
    eligibilityRules: { schemaVersion: 1 },
    rulesVerified: true,
    rulesVersion: 1,
    ...overrides,
  };
}

function codes(result: ReturnType<typeof evaluateProgram>): string[] {
  return result.reasons.map((reason) => reason.code);
}

describe("evaluateProgram: the engine, run for one student and one program", () => {
  it("reports the rules version the program actually has, not a fixed one", () => {
    const result = evaluateProgram(program({ rulesVersion: 3 }), PROFILE, TODAY);

    expect(result.rulesVersion).toBe(3);
  });

  it("says 'check requirements' while a person has not verified the rules, whatever they say", () => {
    const result = evaluateProgram(
      program({ rulesVerified: false, eligibilityRules: { schemaVersion: 1, citizenship: { allowed: ["nz_citizen"] } } }),
      PROFILE,
      TODAY,
    );

    expect(result.verdict).toBe("unknown");
    expect(codes(result)).toContain("RULES_UNVERIFIED");
  });

  describe("a graduation window, as graduate programs use", () => {
    const rules = {
      schemaVersion: 1,
      graduationWindow: { earliest: { year: 2024, month: 3 }, latest: { year: 2026, month: 12 } },
    };

    it("is eligible for someone graduating inside it", () => {
      const result = evaluateProgram(program({ eligibilityRules: rules }), PROFILE, TODAY);

      expect(result.verdict).toBe("eligible");
      expect(codes(result)).toContain("GRADUATION_WINDOW_OK");
    });

    it("is not eligible for someone graduating after it", () => {
      const later = { ...PROFILE, expectedGraduation: { year: 2027, month: 6 } as const };

      const result = evaluateProgram(program({ eligibilityRules: rules }), later, TODAY);

      expect(result.verdict).toBe("ineligible");
      expect(codes(result)).toContain("GRADUATION_OUTSIDE_WINDOW");
    });

    it("is unknown, never a guess, when the student has not said when they graduate", () => {
      const result = evaluateProgram(
        program({ eligibilityRules: rules }),
        { ...PROFILE, expectedGraduation: null },
        TODAY,
      );

      expect(result.verdict).toBe("unknown");
      expect(codes(result)).toContain("PROFILE_INCOMPLETE");
    });

    it("needs no program dates, so a program with no windows can still be judged", () => {
      const result = evaluateProgram(program({ eligibilityRules: rules, windows: [] }), PROFILE, TODAY);

      expect(result.verdict).toBe("eligible");
    });
  });

  describe("citizenship, which is optional and sensitive", () => {
    const rules = { schemaVersion: 1, citizenship: { allowed: ["au_citizen"] } };

    it("is eligible when the student's citizenship is accepted", () => {
      expect(evaluateProgram(program({ eligibilityRules: rules }), PROFILE, TODAY).verdict).toBe("eligible");
    });

    it("is not eligible when it is not accepted", () => {
      const nz = { ...PROFILE, citizenship: "nz_citizen" as const };

      const result = evaluateProgram(program({ eligibilityRules: rules }), nz, TODAY);

      expect(result.verdict).toBe("ineligible");
      expect(codes(result)).toContain("CITIZENSHIP_NOT_ALLOWED");
    });

    it("is unknown when the student chose not to say", () => {
      const result = evaluateProgram(program({ eligibilityRules: rules }), { ...PROFILE, citizenship: null }, TODAY);

      expect(result.verdict).toBe("unknown");
    });
  });

  it("answers 'unknown' with a reason, never an error, for rules the engine cannot read", () => {
    const result = evaluateProgram(program({ eligibilityRules: { schemaVersion: 99, mystery: true } }), PROFILE, TODAY);

    expect(result.verdict).toBe("unknown");
    expect(codes(result)).toContain("RULES_INVALID");
  });

  describe("year level, measured against the program's own dates", () => {
    const penultimate = { schemaVersion: 1, yearLevel: { preset: "penultimate" } };
    const summer = window({
      cycleYear: 2026,
      programStartsOn: "2026-11-01",
      programEndsOn: "2027-02-01",
      status: "upcoming",
    });

    it("works the documented example: a Nov to Feb internship and a Nov 2027 graduate is penultimate", () => {
      const student = { ...PROFILE, expectedGraduation: { year: 2027, month: 11 } as const };

      const result = evaluateProgram(
        program({ programType: "vacationer", windows: [summer], eligibilityRules: penultimate }),
        student,
        TODAY,
      );

      expect(result.verdict).toBe("eligible");
      expect(codes(result)).toContain("YEAR_LEVEL_OK");
    });

    it("judges against the window that is still live, not an older closed one", () => {
      const student = { ...PROFILE, expectedGraduation: { year: 2027, month: 11 } as const };
      const olderClosed = window({
        cycleYear: 2025,
        programStartsOn: "2025-11-01",
        programEndsOn: "2026-02-01",
        status: "closed",
      });

      // Windows come newest first. Against the old dates this student would be four semesters
      // out, which is not penultimate; against the live window it is.
      const result = evaluateProgram(
        program({ programType: "vacationer", windows: [summer, olderClosed], eligibilityRules: penultimate }),
        student,
        TODAY,
      );

      expect(result.verdict).toBe("eligible");
    });

    it("falls back to the newest window when every window has closed", () => {
      const student = { ...PROFILE, expectedGraduation: { year: 2027, month: 11 } as const };
      const newestClosed = { ...summer, status: "closed" as const };

      const result = evaluateProgram(
        program({ programType: "vacationer", windows: [newestClosed], eligibilityRules: penultimate }),
        student,
        TODAY,
      );

      expect(result.verdict).toBe("eligible");
    });
  });
});
