import { describe, expect, it } from "vitest";
import type { Month, YearMonth } from "./semesters";
import { addMonths } from "./year-month";

const ym = (year: number, month: Month): YearMonth => ({ year, month });

describe("addMonths", () => {
  it.each([
    [ym(2026, 11), 3, ym(2027, 2)], // crosses a year boundary
    [ym(2026, 11), 1, ym(2026, 12)],
    [ym(2026, 11), 2, ym(2027, 1)],
    [ym(2027, 2), 12, ym(2028, 2)],
    [ym(2027, 2), 0, ym(2027, 2)],
    [ym(2027, 2), 25, ym(2029, 3)],
    [ym(2027, 2), -2, ym(2026, 12)], // negative goes back
    [ym(2027, 1), -1, ym(2026, 12)],
  ] as const)("%j plus %i months is %j", (start, months, expected) => {
    expect(addMonths(start, months)).toEqual(expected);
  });

  it("does not change its input", () => {
    const start = Object.freeze(ym(2026, 11));

    addMonths(start, 3);

    expect(start).toEqual({ year: 2026, month: 11 });
  });
});
