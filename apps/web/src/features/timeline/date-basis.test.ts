import { describe, expect, it } from "vitest";
import type { ConfirmedEntry, NoDateEntry, TimelineProgram, UsualEntry } from "./build-timeline";
import { DATE_BASIS_LABELS, dateBasis } from "./date-basis";

const program: TimelineProgram = {
  id: "id-a",
  slug: "a",
  name: "Program a",
  programType: "graduate",
  company: { slug: "co-a", name: "Company a", careersUrl: "https://example.com/careers" },
  windows: [],
};

const confirmed = (overrides: Partial<ConfirmedEntry> = {}): ConfirmedEntry => ({
  kind: "confirmed",
  program,
  saved: false,
  windowStatus: "upcoming",
  cycleYear: 2027,
  opensOn: "2027-03-15",
  opensPrecision: "day",
  closesOn: null,
  closesPrecision: null,
  ...overrides,
});

const usual: UsualEntry = {
  kind: "usual",
  program,
  saved: false,
  occurrences: [{ year: 2027, month: 3 }],
  spans: [{ start: { year: 2027, month: 3 }, end: null }],
  basedOn: [{ cycleYear: 2026, sourceUrl: "https://example.com/2026" }],
};

const none: NoDateEntry = { kind: "none", program, saved: false };

describe("dateBasis", () => {
  it("calls an opening the employer stated as a day or a month confirmed", () => {
    expect(dateBasis(confirmed())).toBe("confirmed");
    expect(dateBasis(confirmed({ opensOn: "2027-02-01", opensPrecision: "month" }))).toBe("confirmed");
  });

  it("calls a program that is open now confirmed, even with no dates, because being open is a fact", () => {
    expect(dateBasis(confirmed({ windowStatus: "open", opensOn: null, opensPrecision: null }))).toBe("confirmed");
  });

  it("calls an upcoming program with no stated opening not announced", () => {
    expect(dateBasis(confirmed({ opensOn: null, opensPrecision: null }))).toBe("not-announced");
  });

  it("never lets an estimated opening count as a confirmed one", () => {
    expect(dateBasis(confirmed({ opensOn: "2027-02-01", opensPrecision: "estimated" }))).toBe("not-announced");
  });

  it("calls a guess from past cycles estimated, and a program with nothing not announced", () => {
    expect(dateBasis(usual)).toBe("estimated");
    expect(dateBasis(none)).toBe("not-announced");
  });
});

describe("DATE_BASIS_LABELS", () => {
  it("uses the three plain words students see", () => {
    expect(DATE_BASIS_LABELS).toEqual({
      confirmed: "Confirmed",
      estimated: "Estimated",
      "not-announced": "Not announced",
    });
  });
});
