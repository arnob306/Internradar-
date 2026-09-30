import { describe, expect, it } from "vitest";
import type { Month, YearMonth } from "./semesters";
import { addMonths, monthPosition } from "./year-month";

describe("monthPosition", () => {
  it("rises by one for each following month, across a year boundary", () => {
    expect(monthPosition({ year: 2027, month: 1 }) - monthPosition({ year: 2026, month: 12 })).toBe(1);
  });

  it("orders months chronologically", () => {
    const earlier = monthPosition({ year: 2026, month: 12 });
    const later = monthPosition({ year: 2027, month: 1 });

    expect(earlier).toBeLessThan(later);
  });

  it("gives equal months the same position", () => {
    expect(monthPosition({ year: 2027, month: 6 })).toBe(monthPosition({ year: 2027, month: 6 }));
  });
});

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

  // Review finding M2: a cast hid that 1.5 months gave {month: 12.5}, which is not a month.
  it.each([1.5, -0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses %s months, which cannot give a valid month",
    (months) => {
      expect(() => addMonths(ym(2026, 11), months)).toThrow(RangeError);
    },
  );

  it("does not change its input", () => {
    const start = Object.freeze(ym(2026, 11));

    addMonths(start, 3);

    expect(start).toEqual({ year: 2026, month: 11 });
  });
});
