import { describe, expect, it } from "vitest";
import { buildTimeline, type TimelineProgram, type TimelineWindow } from "./build-timeline";

const TODAY = "2026-10-08";

function window(overrides: Partial<TimelineWindow> = {}): TimelineWindow {
  return {
    cycleYear: 2027,
    windowSeq: 1,
    opensOn: null,
    opensPrecision: null,
    closesOn: null,
    closesPrecision: null,
    status: "unknown",
    sourceUrl: "https://example.com/source",
    ...overrides,
  };
}

function program(slug: string, windows: TimelineWindow[] = [], name = `Program ${slug}`): TimelineProgram {
  return {
    id: `id-${slug}`,
    slug,
    name,
    programType: "graduate",
    company: { slug: `co-${slug}`, name: `Company ${slug}`, careersUrl: "https://example.com/careers" },
    windows,
  };
}

const past = (cycleYear: number, opensOn: string, precision: "day" | "month" = "month", windowSeq = 1) =>
  window({ cycleYear, windowSeq, opensOn, opensPrecision: precision, status: "closed", sourceUrl: `https://example.com/${cycleYear}` });

const build = (programs: TimelineProgram[], saved: readonly string[] = []) => buildTimeline(programs, TODAY, saved);

describe("buildTimeline: confirmed dates", () => {
  it("puts a program with an open window in confirmed, with the dates exactly as given", () => {
    const open = window({ status: "open", opensOn: "2026-09-01", opensPrecision: "day", closesOn: "2026-11-01", closesPrecision: "month" });

    const { confirmed } = build([program("a", [open])]);

    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]).toMatchObject({
      kind: "confirmed",
      windowStatus: "open",
      opensOn: "2026-09-01",
      opensPrecision: "day",
      closesOn: "2026-11-01",
      closesPrecision: "month",
      cycleYear: 2027,
    });
  });

  it("includes an upcoming window", () => {
    const upcoming = window({ status: "upcoming", opensOn: "2027-02-01", opensPrecision: "month" });

    expect(build([program("a", [upcoming])]).confirmed.map((entry) => entry.windowStatus)).toEqual(["upcoming"]);
  });

  it("uses the newest window that has not closed, as the cards do", () => {
    const live = window({ cycleYear: 2027, status: "upcoming", opensOn: "2027-03-01", opensPrecision: "month" });

    const { confirmed } = build([program("a", [live, past(2026, "2025-08-01")])]);

    expect(confirmed[0]).toMatchObject({ cycleYear: 2027, opensOn: "2027-03-01" });
  });

  it("never treats a closed window as upcoming or open", () => {
    const { confirmed } = build([program("a", [past(2026, "2025-08-01")])]);

    expect(confirmed).toEqual([]);
  });

  it("lists open programs first, then by opening date, then by name", () => {
    const programs = [
      program("late", [window({ status: "upcoming", opensOn: "2027-03-01", opensPrecision: "month" })], "Zeta"),
      program("soon", [window({ status: "upcoming", opensOn: "2026-11-15", opensPrecision: "day" })], "Beta"),
      program("open", [window({ status: "open", opensOn: "2026-09-01", opensPrecision: "day" })], "Gamma"),
      program("tie", [window({ status: "upcoming", opensOn: "2026-11-15", opensPrecision: "day" })], "Alpha"),
    ];

    expect(build(programs).confirmed.map((entry) => entry.program.slug)).toEqual(["open", "tie", "soon", "late"]);
  });

  it("puts an open program with no stated opening date after those that have one", () => {
    const programs = [
      program("nodate", [window({ status: "open" })], "A"),
      program("dated", [window({ status: "open", opensOn: "2026-09-01", opensPrecision: "day" })], "B"),
    ];

    expect(build(programs).confirmed.map((entry) => entry.program.slug)).toEqual(["dated", "nodate"]);
  });
});

describe("buildTimeline: usually opens around", () => {
  it("projects a past opening month to the next time that month comes round", () => {
    const { usual } = build([program("a", [past(2026, "2025-08-01")])]);

    expect(usual[0]?.occurrences).toEqual([{ year: 2027, month: 8 }]);
  });

  it("keeps a month later this year in this year, and the current month in this year", () => {
    const later = build([program("a", [past(2026, "2025-11-01")])]).usual[0];
    const current = build([program("b", [past(2026, "2025-10-01")])]).usual[0];

    expect(later?.occurrences).toEqual([{ year: 2026, month: 11 }]);
    expect(current?.occurrences).toEqual([{ year: 2026, month: 10 }]);
  });

  it("rolls the year at the end of December using the Melbourne date it was given", () => {
    const { usual } = buildTimeline([program("a", [past(2026, "2025-01-01")])], "2026-12-31", []);

    expect(usual[0]?.occurrences).toEqual([{ year: 2027, month: 1 }]);
  });

  it("uses a live window that has no dates as a reason to estimate, not to confirm", () => {
    const undated = window({ cycleYear: 2027, status: "unknown" });

    const result = build([program("a", [undated, past(2026, "2025-08-01")])]);

    expect(result.confirmed).toEqual([]);
    expect(result.usual).toHaveLength(1);
  });

  it("takes only the month from a day-precision past date, never the day", () => {
    const { usual } = build([program("a", [past(2026, "2025-08-19", "day")])]);

    expect(usual[0]?.occurrences).toEqual([{ year: 2027, month: 8 }]);
    expect(JSON.stringify(usual[0]?.occurrences)).not.toMatch(/19/);
  });

  it("ignores an estimated date, which proves nothing", () => {
    const estimated = window({ cycleYear: 2026, status: "closed", opensOn: "2025-08-01", opensPrecision: "estimated" });

    const result = build([program("a", [estimated])]);

    expect(result.usual).toEqual([]);
    expect(result.none.map((entry) => entry.program.slug)).toEqual(["a"]);
  });

  it("ignores a past window that only has a closing date", () => {
    const closingOnly = window({ cycleYear: 2026, status: "closed", closesOn: "2025-09-08", closesPrecision: "day" });

    expect(build([program("a", [closingOnly])]).usual).toEqual([]);
  });

  it("ignores an opening that has not happened yet, so a future date is never called a past one", () => {
    const future = window({ cycleYear: 2027, status: "unknown", opensOn: "2027-03-01", opensPrecision: "month" });

    expect(build([program("a", [future])]).usual).toEqual([]);
  });

  it("uses the two most recent cycles and shows every month they gave, soonest first", () => {
    const windows = [past(2026, "2025-09-01"), past(2025, "2024-08-01"), past(2024, "2023-03-01")];

    const { usual } = build([program("a", windows)]);

    expect(usual[0]?.occurrences).toEqual([
      { year: 2027, month: 8 },
      { year: 2027, month: 9 },
    ]);
    expect(usual[0]?.basedOn.map((item) => item.cycleYear)).toEqual([2026, 2025]);
  });

  it("shows the month once when both cycles agree", () => {
    const { usual } = build([program("a", [past(2026, "2025-08-01"), past(2025, "2024-08-15", "day")])]);

    expect(usual[0]?.occurrences).toEqual([{ year: 2027, month: 8 }]);
  });

  it("keeps both rounds of one cycle", () => {
    const { usual } = build([program("a", [past(2026, "2025-08-01", "month", 2), past(2026, "2025-03-01", "month", 1)])]);

    expect(usual[0]?.occurrences).toEqual([
      { year: 2027, month: 3 },
      { year: 2027, month: 8 },
    ]);
  });

  it("says which cycles it is based on and where each came from", () => {
    const { usual } = build([program("a", [past(2026, "2025-08-01"), past(2025, "2024-08-01")])]);

    expect(usual[0]?.basedOn).toEqual([
      { cycleYear: 2026, sourceUrl: "https://example.com/2026" },
      { cycleYear: 2025, sourceUrl: "https://example.com/2025" },
    ]);
  });

  it("orders programs by when they are next expected, then by name", () => {
    const programs = [
      program("aug", [past(2026, "2025-08-01")], "Aug Co"),
      program("nov", [past(2026, "2025-11-01")], "Nov Co"),
      program("nov2", [past(2026, "2025-11-01")], "Another Nov Co"),
    ];

    expect(build(programs).usual.map((entry) => entry.program.slug)).toEqual(["nov2", "nov", "aug"]);
  });
});

describe("buildTimeline: no date yet", () => {
  it("lists a program with no windows, and one with only dateless windows, in alphabetical order", () => {
    const programs = [program("z", [], "Zed"), program("a", [window()], "Ada")];

    expect(build(programs).none.map((entry) => entry.program.name)).toEqual(["Ada", "Zed"]);
  });

  it("puts every program in exactly one group", () => {
    const programs = [
      program("c", [window({ status: "open" })]),
      program("u", [past(2026, "2025-08-01")]),
      program("n", []),
    ];

    const { confirmed, usual, none } = build(programs);

    expect(confirmed.length + usual.length + none.length).toBe(3);
  });
});

describe("buildTimeline: saved programs and safety", () => {
  it("flags the programs the student saved, in every group", () => {
    const programs = [
      program("c", [window({ status: "open" })]),
      program("u", [past(2026, "2025-08-01")]),
      program("n", []),
    ];

    const { confirmed, usual, none } = build(programs, ["id-c", "id-n"]);

    expect([confirmed[0]?.saved, usual[0]?.saved, none[0]?.saved]).toEqual([true, false, true]);
  });

  it("does not change what it was given", () => {
    const input = Object.freeze([
      Object.freeze(program("a", Object.freeze([past(2026, "2025-08-01")]) as unknown as TimelineWindow[])),
    ]);

    expect(() => build(input as unknown as TimelineProgram[], Object.freeze(["id-a"]))).not.toThrow();
  });
});

const pastSpan = (
  cycleYear: number,
  opensOn: string,
  closesOn: string | null,
  closesPrecision: "day" | "month" | "estimated" = "day",
  windowSeq = 1,
) =>
  window({
    cycleYear,
    windowSeq,
    opensOn,
    opensPrecision: "day",
    closesOn,
    closesPrecision: closesOn === null ? null : closesPrecision,
    status: "closed",
  });

describe("buildTimeline: how long a past window stayed open", () => {
  it("projects the opening and closing months of a past window to the next time they come round", () => {
    const { usual } = build([program("a", [pastSpan(2026, "2025-08-12", "2025-09-08")])]);

    expect(usual[0]?.spans).toEqual([{ start: { year: 2027, month: 8 }, end: { year: 2027, month: 9 } }]);
  });

  it("has no end when the past window had no closing date, or only an estimate of one", () => {
    const none = build([program("a", [pastSpan(2026, "2025-08-12", null)])]).usual[0];
    const estimated = build([program("b", [pastSpan(2026, "2025-08-12", "2025-09-08", "estimated")])]).usual[0];

    expect(none?.spans).toEqual([{ start: { year: 2027, month: 8 }, end: null }]);
    expect(estimated?.spans).toEqual([{ start: { year: 2027, month: 8 }, end: null }]);
  });

  it("keeps the length when a window runs over the end of a year", () => {
    const { usual } = build([program("a", [pastSpan(2026, "2025-12-01", "2026-01-15")])]);

    expect(usual[0]?.spans).toEqual([{ start: { year: 2026, month: 12 }, end: { year: 2027, month: 1 } }]);
  });

  it("shows one span when two cycles agree and both when they differ, soonest first", () => {
    const agree = build([program("a", [pastSpan(2026, "2025-08-12", "2025-09-08"), pastSpan(2025, "2024-08-05", "2024-09-30")])]);
    const differ = build([program("b", [pastSpan(2026, "2025-08-12", "2025-09-08"), pastSpan(2025, "2024-03-01", "2024-04-01")])]);

    expect(agree.usual[0]?.spans).toHaveLength(1);
    expect(differ.usual[0]?.spans.map((span) => span.start.month)).toEqual([3, 8]);
  });

  it("is still never more precise than a month", () => {
    const { usual } = build([program("a", [pastSpan(2026, "2025-08-12", "2025-09-08")])]);

    expect(JSON.stringify(usual[0]?.spans)).not.toMatch(/12|08"/);
    expect(Object.keys(usual[0]?.spans[0]?.start ?? {}).sort()).toEqual(["month", "year"]);
  });
});
