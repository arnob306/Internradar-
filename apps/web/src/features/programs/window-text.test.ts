import { describe, expect, it } from "vitest";
import { describeWindows, type TextWindow } from "./window-text";

function win(overrides: Partial<TextWindow> = {}): TextWindow {
  return {
    status: "unknown",
    opensOn: null,
    opensPrecision: null,
    closesOn: null,
    closesPrecision: null,
    ...overrides,
  };
}

describe("describeWindows: how precisely the employer said it", () => {
  it("shows exact dates for day precision", () => {
    const result = describeWindows(
      [win({ opensOn: "2026-08-12", opensPrecision: "day", closesOn: "2026-09-08", closesPrecision: "day" })],
      "closed",
    );

    expect(result).toEqual({ text: "12 Aug 2026 to 8 Sep 2026", estimated: false });
  });

  it("handles a single exact date", () => {
    expect(
      describeWindows([win({ closesOn: "2026-09-08", closesPrecision: "day" })], "open").text,
    ).toBe("Closes 8 Sep 2026");
    expect(
      describeWindows([win({ opensOn: "2026-08-12", opensPrecision: "day" })], "open").text,
    ).toBe("Opens 12 Aug 2026");
  });

  it("shows only the month for month precision, never an invented day", () => {
    expect(
      describeWindows(
        [win({ opensOn: "2027-02-01", opensPrecision: "month", closesOn: "2027-03-01", closesPrecision: "month" })],
        "upcoming",
      ),
    ).toEqual({ text: "Feb 2027 to Mar 2027", estimated: false });
  });

  it("collapses a window that opens and closes in the same month", () => {
    expect(
      describeWindows(
        [win({ opensOn: "2027-03-01", opensPrecision: "month", closesOn: "2027-03-01", closesPrecision: "month" })],
        "upcoming",
      ).text,
    ).toBe("Mar 2027");
  });

  it("says 'in' for a single month", () => {
    expect(
      describeWindows([win({ opensOn: "2027-02-01", opensPrecision: "month" })], "upcoming").text,
    ).toBe("Opens in Feb 2027");
    expect(
      describeWindows([win({ closesOn: "2027-03-01", closesPrecision: "month" })], "open").text,
    ).toBe("Closes in Mar 2027");
  });

  it("flags an estimate and drops the year it never really stated", () => {
    expect(
      describeWindows(
        [win({ opensOn: "2026-07-01", opensPrecision: "estimated", closesOn: "2026-08-01", closesPrecision: "estimated" })],
        "unknown",
      ),
    ).toEqual({ text: "Usually Jul to Aug", estimated: true });
  });

  it("flags a single estimated end", () => {
    expect(
      describeWindows([win({ opensOn: "2026-02-01", opensPrecision: "estimated" })], "unknown"),
    ).toEqual({ text: "Usually opens in Feb", estimated: true });
  });

  it("shows only the date it knows when the other end is just an estimate", () => {
    expect(
      describeWindows(
        [win({ opensOn: "2026-02-01", opensPrecision: "estimated", closesOn: "2026-06-30", closesPrecision: "day" })],
        "closed",
      ),
    ).toEqual({ text: "Closes 30 Jun 2026", estimated: false });
  });
});

describe("describeWindows: no dates", () => {
  it.each([
    ["open", "Open now. No closing date listed."],
    ["closed", "This round has closed."],
    ["upcoming", "No dates on the employer's page yet."],
    ["unknown", "No dates on the employer's page yet."],
  ] as const)("when %s it says %s", (status, text) => {
    expect(describeWindows([win({ status })], status)).toEqual({ text, estimated: false });
    expect(describeWindows([], status)).toEqual({ text, estimated: false });
  });
});

describe("describeWindows: which window to describe", () => {
  it("prefers the newest window that has not closed over an older closed one", () => {
    const newest = win({ status: "upcoming", opensOn: "2027-02-01", opensPrecision: "month" });
    const older = win({ status: "closed", closesOn: "2026-09-08", closesPrecision: "day" });

    expect(describeWindows([newest, older], "upcoming").text).toBe("Opens in Feb 2027");
  });

  it("falls back to the newest window when every window has closed", () => {
    const newest = win({ status: "closed", closesOn: "2026-09-08", closesPrecision: "day" });
    const older = win({ status: "closed", closesOn: "2025-09-08", closesPrecision: "day" });

    expect(describeWindows([newest, older], "closed").text).toBe("Closes 8 Sep 2026");
  });
});
