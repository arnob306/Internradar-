import { describe, expect, it } from "vitest";
import type { Month, YearMonth } from "../academic-calendar/semesters";
import { evaluateGraduationWindow } from "./graduation-window";

const ym = (year: number, month: Month): YearMonth => ({ year, month });

// A window is inclusive at both ends and has month precision.
describe("evaluateGraduationWindow", () => {
  const window2027 = { earliest: ym(2027, 1), latest: ym(2027, 12) };

  it.each([
    ["the first month of the window", ym(2027, 1), "eligible", "GRADUATION_WINDOW_OK"],
    ["the month before the window", ym(2026, 12), "ineligible", "GRADUATION_OUTSIDE_WINDOW"],
    ["the last month of the window", ym(2027, 12), "eligible", "GRADUATION_WINDOW_OK"],
    ["the month after the window", ym(2028, 1), "ineligible", "GRADUATION_OUTSIDE_WINDOW"],
    ["the middle of the window", ym(2027, 6), "eligible", "GRADUATION_WINDOW_OK"],
  ] as const)("%s", (_label, graduation, verdict, code) => {
    const result = evaluateGraduationWindow(window2027, graduation);

    expect(result).toMatchObject({ criterion: "graduation_window", verdict, code });
  });

  it("with only a start, accepts any later graduation", () => {
    const result = evaluateGraduationWindow({ earliest: ym(2026, 7) }, ym(2030, 11));

    expect(result.verdict).toBe("eligible");
  });

  it("with only a start, rejects an earlier graduation", () => {
    const result = evaluateGraduationWindow({ earliest: ym(2026, 7) }, ym(2026, 6));

    expect(result.verdict).toBe("ineligible");
  });

  it("with only an end, accepts any earlier graduation", () => {
    const result = evaluateGraduationWindow({ latest: ym(2027, 12) }, ym(2025, 11));

    expect(result.verdict).toBe("eligible");
  });

  it("with only an end, rejects a later graduation", () => {
    const result = evaluateGraduationWindow({ latest: ym(2027, 12) }, ym(2028, 1));

    expect(result.verdict).toBe("ineligible");
  });

  it("with no bounds, accepts any graduation", () => {
    expect(evaluateGraduationWindow({}, ym(2040, 6)).verdict).toBe("eligible");
  });

  it("is unknown without a graduation date", () => {
    const result = evaluateGraduationWindow(window2027, null);

    expect(result).toMatchObject({ verdict: "unknown", code: "PROFILE_INCOMPLETE" });
  });

  it("does not change its inputs", () => {
    const window = Object.freeze({ earliest: Object.freeze(ym(2027, 1)) });

    expect(evaluateGraduationWindow(window, Object.freeze(ym(2027, 6)))).toEqual(
      evaluateGraduationWindow(window, ym(2027, 6)),
    );
  });
});
