import { describe, expect, it } from "vitest";
import { melbourneDate } from "./melbourne-date";

describe("melbourneDate", () => {
  it("gives the Melbourne calendar date, not the UTC date", () => {
    // 2026-07-14 20:00 UTC is already the 15th in Melbourne (AEST, UTC+10).
    expect(melbourneDate(new Date("2026-07-14T20:00:00Z"))).toBe("2026-07-15");
  });

  it("changes day at Melbourne midnight in winter (UTC+10)", () => {
    expect(melbourneDate(new Date("2026-07-14T13:59:59Z"))).toBe("2026-07-14");
    expect(melbourneDate(new Date("2026-07-14T14:00:00Z"))).toBe("2026-07-15");
  });

  it("changes day at Melbourne midnight in summer (UTC+11)", () => {
    expect(melbourneDate(new Date("2026-12-14T12:59:59Z"))).toBe("2026-12-14");
    expect(melbourneDate(new Date("2026-12-14T13:00:00Z"))).toBe("2026-12-15");
  });

  it("handles the daylight-saving switch on Sunday 4 October 2026", () => {
    // Before 2am on the 4th it is still UTC+10; after, UTC+11.
    expect(melbourneDate(new Date("2026-10-03T13:59:59Z"))).toBe("2026-10-03");
    expect(melbourneDate(new Date("2026-10-03T14:00:00Z"))).toBe("2026-10-04");
    expect(melbourneDate(new Date("2026-10-04T12:59:59Z"))).toBe("2026-10-04");
    expect(melbourneDate(new Date("2026-10-04T13:00:00Z"))).toBe("2026-10-05");
  });

  it("always returns a zero-padded ISO date", () => {
    expect(melbourneDate(new Date("2026-01-05T03:00:00Z"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(melbourneDate(new Date("2026-01-05T03:00:00Z"))).toBe("2026-01-05");
  });

  it("rejects an invalid date instead of returning a nonsense string", () => {
    expect(() => melbourneDate(new Date("not a date"))).toThrow(/invalid/i);
  });
});
