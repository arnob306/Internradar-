import { describe, expect, it } from "vitest";
import { FixedClock } from "./clock";

describe("FixedClock", () => {
  it("returns the injected instant", () => {
    // Arrange
    const instant = new Date("2026-09-30T00:00:00+10:00");
    const clock = new FixedClock(instant);

    // Act
    const now = clock.now();

    // Assert
    expect(now.toISOString()).toBe("2026-09-29T14:00:00.000Z");
  });

  it("returns the same instant on every call", () => {
    const clock = new FixedClock(new Date("2027-02-01T00:00:00Z"));

    expect(clock.now().getTime()).toBe(clock.now().getTime());
  });

  it("does not let callers change the stored instant", () => {
    const clock = new FixedClock(new Date("2027-02-01T00:00:00Z"));

    clock.now().setUTCFullYear(1999);

    expect(clock.now().getUTCFullYear()).toBe(2027);
  });

  it("is unaffected by later changes to the date it was built from", () => {
    const source = new Date("2027-02-01T00:00:00Z");
    const clock = new FixedClock(source);

    source.setUTCFullYear(1999);

    expect(clock.now().getUTCFullYear()).toBe(2027);
  });
});
