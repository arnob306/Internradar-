import type { ReasonCode, Verdict } from "@internradar/domain";
import { describe, expect, it } from "vitest";
import { reasonText, verdictLabel } from "./reason-text";

// A Record forces this list to name every code: adding a code to the engine without
// adding it here is a type error, and then reasonText has to handle it too.
const ALL_CODES: Record<ReasonCode, true> = {
  YEAR_LEVEL_OK: true,
  SEMESTERS_REMAINING_OUT_OF_RANGE: true,
  MID_YEAR_GRADUATE_CHECK_EMPLOYER: true,
  OFF_CYCLE_GRADUATION_CHECK_EMPLOYER: true,
  ALREADY_GRADUATED: true,
  GRADUATION_WINDOW_OK: true,
  GRADUATION_OUTSIDE_WINDOW: true,
  CITIZENSHIP_OK: true,
  CITIZENSHIP_NOT_ALLOWED: true,
  DISCIPLINE_OK: true,
  DISCIPLINE_MISMATCH: true,
  DEGREE_LEVEL_OK: true,
  DEGREE_LEVEL_NOT_ALLOWED: true,
  RULES_UNVERIFIED: true,
  RULES_INVALID: true,
  PROFILE_INCOMPLETE: true,
  PROGRAM_DATES_MISSING: true,
};

describe("reasonText", () => {
  it.each(Object.keys(ALL_CODES) as ReasonCode[])("%s has plain-language text", (code) => {
    const text = reasonText(code, {});

    expect(text.length).toBeGreaterThan(10);
    expect(text).not.toMatch(/[A-Z]{3,}_[A-Z]/); // never a raw code
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("[object");
  });

  it("names the missing profile field in plain words", () => {
    expect(reasonText("PROFILE_INCOMPLETE", { field: "expectedGraduation" })).toContain(
      "expected graduation",
    );
    expect(reasonText("PROFILE_INCOMPLETE", { field: "citizenship" })).toContain("citizenship");
  });

  it("falls back to a generic phrase for a field it does not know", () => {
    const text = reasonText("PROFILE_INCOMPLETE", { field: "somethingNew" });

    expect(text).toContain("your profile");
    expect(text).not.toContain("somethingNew");
  });

  it("handles missing params without throwing", () => {
    expect(() => reasonText("PROFILE_INCOMPLETE", {})).not.toThrow();
    expect(reasonText("PROFILE_INCOMPLETE", {})).toContain("your profile");
  });

  it("tells students when to confirm with the employer instead of guessing", () => {
    expect(reasonText("RULES_UNVERIFIED", {})).toMatch(/employer/i);
    expect(reasonText("MID_YEAR_GRADUATE_CHECK_EMPLOYER", {})).toMatch(/employer/i);
    expect(reasonText("OFF_CYCLE_GRADUATION_CHECK_EMPLOYER", {})).toMatch(/employer/i);
  });
});

describe("verdictLabel", () => {
  it.each<[Verdict, string]>([
    ["eligible", "Eligible"],
    ["ineligible", "Not eligible"],
    ["unknown", "Check requirements"],
  ])("labels %s as %s", (verdict, label) => {
    expect(verdictLabel(verdict)).toBe(label);
  });
});
