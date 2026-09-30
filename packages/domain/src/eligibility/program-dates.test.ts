import { describe, expect, it } from "vitest";
import type { Month, YearMonth } from "../academic-calendar/semesters";
import { resolveProgramDates, type ProgramWindow } from "./program-dates";

const ym = (year: number, month: Month): YearMonth => ({ year, month });

function window(overrides: Partial<ProgramWindow>): ProgramWindow {
  return {
    programType: "internship",
    cycleYear: 2026,
    programStart: null,
    programEnd: null,
    ...overrides,
  };
}

// cycle_year is the year the program STARTS (decision D1).
describe("resolveProgramDates", () => {
  it("uses the dates it is given and reports nothing was assumed", () => {
    const dates = resolveProgramDates(
      window({ programStart: ym(2026, 12), programEnd: ym(2027, 3) }),
    );

    expect(dates).toEqual({ start: ym(2026, 12), end: ym(2027, 3), assumed: false });
  });

  it.each([
    ["internship", 2026, ym(2026, 11), ym(2027, 2)],
    ["vacationer", 2026, ym(2026, 11), ym(2027, 2)],
    ["graduate", 2027, ym(2027, 2), ym(2028, 2)],
  ] as const)("derives %s dates for cycle %i from the program type", (type, cycle, start, end) => {
    const dates = resolveProgramDates(window({ programType: type, cycleYear: cycle }));

    expect(dates).toEqual({ start, end, assumed: true });
  });

  it("derives a missing end from the start it was given", () => {
    const dates = resolveProgramDates(window({ programStart: ym(2026, 12) }));

    expect(dates).toEqual({ start: ym(2026, 12), end: ym(2027, 3), assumed: true });
  });

  it("derives a missing start from the type and keeps the end it was given", () => {
    const dates = resolveProgramDates(window({ programEnd: ym(2027, 2) }));

    expect(dates).toEqual({ start: ym(2026, 11), end: ym(2027, 2), assumed: true });
  });

  it.each(["cadetship", "discovery"] as const)(
    "does not invent dates for a %s program",
    (type) => {
      const dates = resolveProgramDates(window({ programType: type }));

      expect(dates).toEqual({ start: null, end: null, assumed: false });
    },
  );

  it("keeps a given start for a type with no defaults and leaves the end unknown", () => {
    const dates = resolveProgramDates(
      window({ programType: "cadetship", programStart: ym(2027, 2) }),
    );

    expect(dates).toEqual({ start: ym(2027, 2), end: null, assumed: false });
  });
});
