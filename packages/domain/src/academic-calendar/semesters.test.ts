import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { finalSemester, semestersRemaining, type Month, type YearMonth } from "./semesters";

const ym = (year: number, month: Month): YearMonth => ({ year, month });

// Decision D5: S1 starts in February, S2 in July. A student graduating in
// January finished the previous year's S2. ASSUMPTION (not in the design): a
// graduation in February to May falls in the S1 that is running.
describe("finalSemester", () => {
  it.each([
    [ym(2027, 1), { year: 2026, term: "S2" }], // January belongs to the previous year
    [ym(2027, 2), { year: 2027, term: "S1" }], // Feb-May: assumption, see above
    [ym(2027, 5), { year: 2027, term: "S1" }],
    [ym(2027, 6), { year: 2027, term: "S1" }], // Jun-Aug: mid-year graduate
    [ym(2027, 8), { year: 2027, term: "S1" }],
    [ym(2027, 9), { year: 2027, term: "S2" }], // Sep-Dec
    [ym(2027, 11), { year: 2027, term: "S2" }],
    [ym(2027, 12), { year: 2027, term: "S2" }],
  ] as const)("graduating %j finishes in %j", (graduation, expected) => {
    expect(finalSemester(graduation)).toEqual(expected);
  });
});

// Counts semester starts (February, July) in or after the month `after`, up to and
// including the final semester. Rows marked DECISION D5 are the boundary cases.
describe("semestersRemaining", () => {
  it.each([
    [ym(2027, 2), ym(2027, 11), 2],
    [ym(2027, 2), ym(2028, 11), 4],
    [ym(2027, 2), ym(2027, 6), 1],
    [ym(2027, 2), ym(2027, 8), 1],
    [ym(2027, 2), ym(2027, 9), 2],
    [ym(2027, 2), ym(2028, 1), 2], // DECISION D5: January is the previous year's S2
    [ym(2027, 2), ym(2028, 6), 3],
    [ym(2027, 2), ym(2029, 11), 6],
    [ym(2027, 2), ym(2026, 11), 0], // already graduated
    [ym(2027, 3), ym(2027, 11), 1], // DECISION D5: S1 has already started
    [ym(2027, 7), ym(2027, 11), 1], // DECISION D5: S2 starts in the month `after`
    [ym(2027, 8), ym(2027, 11), 0],
    [ym(2027, 1), ym(2027, 11), 2],
    [ym(2027, 6), ym(2027, 6), 0], // DECISION D5: graduating this month, S1 is over
    [ym(2027, 2), ym(2027, 2), 1], // February graduation: the running S1 (assumption)
    [ym(2027, 2), ym(2027, 5), 1], // May graduation: the running S1 (assumption)
  ] as const)("from %j to %j leaves %i", (after, graduation, expected) => {
    expect(semestersRemaining(after, graduation)).toBe(expected);
  });

  it("does not change its inputs", () => {
    const after = Object.freeze(ym(2027, 2));
    const graduation = Object.freeze(ym(2028, 11));

    expect(semestersRemaining(after, graduation)).toBe(4);
    expect(after).toEqual({ year: 2027, month: 2 });
    expect(graduation).toEqual({ year: 2028, month: 11 });
  });
});

describe("semestersRemaining properties", () => {
  const month = fc.constantFrom<Month>(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12);
  const yearMonth = fc.record({ year: fc.integer({ min: 2000, max: 2100 }), month });
  const order = (v: YearMonth): number => v.year * 12 + v.month;

  it("is a non-negative whole number", () => {
    fc.assert(
      fc.property(yearMonth, yearMonth, (after, graduation) => {
        const n = semestersRemaining(after, graduation);
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it("never increases as `after` moves later", () => {
    fc.assert(
      fc.property(yearMonth, yearMonth, yearMonth, (a, b, graduation) => {
        const [earlier, later] = order(a) <= order(b) ? [a, b] : [b, a];
        expect(semestersRemaining(earlier, graduation)).toBeGreaterThanOrEqual(
          semestersRemaining(later, graduation),
        );
      }),
    );
  });

  it("never decreases as the graduation date moves later", () => {
    fc.assert(
      fc.property(yearMonth, yearMonth, yearMonth, (after, a, b) => {
        const [earlier, later] = order(a) <= order(b) ? [a, b] : [b, a];
        expect(semestersRemaining(after, earlier)).toBeLessThanOrEqual(
          semestersRemaining(after, later),
        );
      }),
    );
  });

  it("is deterministic", () => {
    fc.assert(
      fc.property(yearMonth, yearMonth, (after, graduation) => {
        expect(semestersRemaining(after, graduation)).toBe(semestersRemaining(after, graduation));
      }),
    );
  });
});
