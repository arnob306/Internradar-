import { describe, expect, it } from "vitest";
import { DISCIPLINES, expandDisciplines, isDiscipline } from "./vocabulary";

// Decision D2: a frozen list of about 15 terms plus a stem_any group. Unmapped text is
// never guessed at; it is handled at extraction time and becomes "unknown" there.
describe("DISCIPLINES", () => {
  it("has no duplicates", () => {
    expect(new Set(DISCIPLINES).size).toBe(DISCIPLINES.length);
  });

  it("stays small enough to keep frozen", () => {
    expect(DISCIPLINES.length).toBeLessThanOrEqual(20);
  });
});

describe("isDiscipline", () => {
  it.each(["computer_science", "law", "engineering_civil"])("accepts %s", (value) => {
    expect(isDiscipline(value)).toBe(true);
  });

  it.each(["compsci", "Computer Science", "", "stem_any"])("rejects %j", (value) => {
    expect(isDiscipline(value)).toBe(false);
  });
});

describe("expandDisciplines", () => {
  it("returns specific terms unchanged", () => {
    expect(expandDisciplines(["law", "economics"])).toEqual(new Set(["law", "economics"]));
  });

  it("expands stem_any to the science, technology, engineering and maths terms", () => {
    const expanded = expandDisciplines(["stem_any"]);

    expect(expanded).toContain("computer_science");
    expect(expanded).toContain("mathematics_statistics");
    expect(expanded).toContain("engineering_civil");
    expect(expanded).toContain("science_other");
  });

  it("keeps commerce and law out of stem_any", () => {
    const expanded = expandDisciplines(["stem_any"]);

    for (const term of ["law", "economics", "accounting", "commerce_finance", "business_management"]) {
      expect(expanded).not.toContain(term);
    }
  });

  it("merges a group with specific terms and removes duplicates", () => {
    const expanded = expandDisciplines(["stem_any", "computer_science", "law"]);

    expect(expanded).toContain("law");
    expect([...expanded].filter((t) => t === "computer_science")).toHaveLength(1);
  });

  it("returns an empty set for an empty rule", () => {
    expect(expandDisciplines([]).size).toBe(0);
  });
});
