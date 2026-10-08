import { describe, expect, it } from "vitest";
import type { ConfirmedEntry, NoDateEntry, TimelineProgram, UsualEntry } from "./build-timeline";
import { nextAction, PREP_LEAD_DAYS } from "./next-action";

const TODAY = "2026-10-08";

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

const usual = (months: readonly { year: number; month: number }[]): UsualEntry => ({
  kind: "usual",
  program,
  saved: false,
  occurrences: months,
  spans: months.map((start) => ({ start, end: null })),
  basedOn: [{ cycleYear: 2026, sourceUrl: "https://example.com/2026" }],
});

const none: NoDateEntry = { kind: "none", program, saved: false };

const NOT_ANNOUNCED = "Dates not announced. Check the employer's page.";

describe("nextAction: the preparation lead", () => {
  it("is four weeks", () => {
    expect(PREP_LEAD_DAYS).toBe(28);
  });
});

describe("nextAction: a program that is open now", () => {
  const open = (overrides: Partial<ConfirmedEntry> = {}) => confirmed({ windowStatus: "open", ...overrides });

  it("says when it closes, to the day, when the employer gave the day", () => {
    expect(nextAction(open({ closesOn: "2026-11-20", closesPrecision: "day" }), TODAY)).toBe(
      "Applications close 20 Nov 2026. Apply before then.",
    );
  });

  it("says only the month when the employer gave only the month", () => {
    expect(nextAction(open({ closesOn: "2027-03-01", closesPrecision: "month" }), TODAY)).toBe(
      "Applications close in Mar 2027. Apply early.",
    );
  });

  it("says there is no closing date when there is none, or only a guess at one", () => {
    expect(nextAction(open(), TODAY)).toBe("No closing date listed. Apply soon.");
    expect(nextAction(open({ closesOn: "2027-03-01", closesPrecision: "estimated" }), TODAY)).toBe(
      "No closing date listed. Apply soon.",
    );
  });
});

describe("nextAction: a program with a stated opening", () => {
  it("says when to start preparing: four weeks before a day it opens", () => {
    expect(nextAction(confirmed({ opensOn: "2027-03-15" }), TODAY)).toBe("Start preparing from 15 Feb 2027.");
  });

  it("counts four weeks back across a year end", () => {
    expect(nextAction(confirmed({ opensOn: "2027-01-10" }), TODAY)).toBe("Start preparing from 13 Dec 2026.");
  });

  it("uses the earliest day it could open when only the month is known", () => {
    expect(nextAction(confirmed({ opensOn: "2027-02-01", opensPrecision: "month" }), TODAY)).toBe(
      "Start preparing from 4 Jan 2027.",
    );
  });

  it("says to start now when the preparation date is today", () => {
    expect(nextAction(confirmed({ opensOn: "2026-11-05" }), TODAY)).toBe("Opening soon. Start preparing now.");
  });

  it("names the day after today as a date, not as now", () => {
    expect(nextAction(confirmed({ opensOn: "2026-11-06" }), TODAY)).toBe("Start preparing from 9 Oct 2026.");
  });

  it("says to start now when the preparation date has passed, or the opening has", () => {
    expect(nextAction(confirmed({ opensOn: "2026-10-20" }), TODAY)).toBe("Opening soon. Start preparing now.");
    expect(nextAction(confirmed({ opensOn: "2026-09-01" }), TODAY)).toBe("Opening soon. Start preparing now.");
  });
});

describe("nextAction: a program the employer says is coming, with no date", () => {
  it("says the dates are not announced, and never treats a guessed date as stated", () => {
    expect(nextAction(confirmed({ opensOn: null, opensPrecision: null }), TODAY)).toBe(NOT_ANNOUNCED);
    expect(nextAction(confirmed({ opensOn: "2027-02-01", opensPrecision: "estimated" }), TODAY)).toBe(NOT_ANNOUNCED);
  });
});

describe("nextAction: a guess from past cycles", () => {
  it("names the usual month and the month to start preparing, never a day", () => {
    const text = nextAction(usual([{ year: 2027, month: 3 }]), TODAY);

    expect(text).toBe("Usually opens around March. Start preparing around February.");
    expect(text).not.toMatch(/\d/);
  });

  it("works from the soonest month when it usually opens twice", () => {
    expect(
      nextAction(
        usual([
          { year: 2027, month: 3 },
          { year: 2027, month: 8 },
        ]),
        TODAY,
      ),
    ).toBe("Usually opens around March. Start preparing around February.");
  });

  it("counts the preparation month from the first day of the usual month", () => {
    expect(nextAction(usual([{ year: 2027, month: 2 }]), TODAY)).toBe(
      "Usually opens around February. Start preparing around January.",
    );
  });

  it("says to start now when the preparation time has already begun", () => {
    expect(nextAction(usual([{ year: 2026, month: 10 }]), TODAY)).toBe(
      "Usually opens around October. Start preparing now.",
    );
    expect(nextAction(usual([{ year: 2026, month: 11 }]), TODAY)).toBe(
      "Usually opens around November. Start preparing now.",
    );
  });
});

describe("nextAction: a program with no date at all", () => {
  it("says the dates are not announced", () => {
    expect(nextAction(none, TODAY)).toBe(NOT_ANNOUNCED);
  });
});
