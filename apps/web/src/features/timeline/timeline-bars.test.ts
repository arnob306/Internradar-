import { describe, expect, it } from "vitest";
import { buildTimeline, type TimelineProgram, type TimelineWindow } from "./build-timeline";
import { chartFor } from "./timeline-bars";

// The axis runs Oct 2026 to Sep 2027, so Oct is month 0 and each month is 1/12 (8.33%) of the width.
const TODAY = "2026-10-08";
const pct = (months: number) => (months / 12) * 100;

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

const upcoming = (
  opensOn: string,
  opensPrecision: "day" | "month",
  closesOn: string | null = null,
  closesPrecision: "day" | "month" | null = null,
) => window({ status: "upcoming", opensOn, opensPrecision, closesOn, closesPrecision });

const pastSpan = (opensOn: string, closesOn: string | null, windowSeq = 1, cycleYear = 2026) =>
  window({
    cycleYear,
    windowSeq,
    opensOn,
    opensPrecision: "day",
    closesOn,
    closesPrecision: closesOn === null ? null : "day",
    status: "closed",
  });

const chart = (programs: TimelineProgram[], saved: string[] = []) => chartFor(buildTimeline(programs, TODAY, saved), TODAY);

describe("chartFor: the axis", () => {
  it("runs twelve months from the current month", () => {
    const { axis } = chart([]);

    expect(axis).toHaveLength(12);
    expect(axis[0]).toEqual({ year: 2026, month: 10 });
    expect(axis[3]).toEqual({ year: 2027, month: 1 });
    expect(axis[11]).toEqual({ year: 2027, month: 9 });
  });

  it("marks today partway through the first month", () => {
    expect(chart([]).todayPct).toBeCloseTo(pct(7 / 31), 5);
  });
});

describe("chartFor: stated dates", () => {
  it("draws a day-precision window from its opening day to the end of its closing day", () => {
    const { rows } = chart([program("a", [upcoming("2026-11-15", "day", "2026-12-15", "day")])]);

    const bar = rows[0]?.bars[0];
    expect(bar).toMatchObject({ kind: "confirmed", startsBefore: false, endKnown: true });
    expect(bar?.startPct).toBeCloseTo(pct(1 + 14 / 30), 5);
    expect(bar?.endPct).toBeCloseTo(pct(2 + 15 / 31), 5);
  });

  it("fills whole months for a month-precision window", () => {
    const { rows } = chart([program("a", [upcoming("2027-02-01", "month", "2027-03-01", "month")])]);

    expect(rows[0]?.bars[0]?.startPct).toBeCloseTo(pct(4), 5);
    expect(rows[0]?.bars[0]?.endPct).toBeCloseTo(pct(6), 5);
  });

  it("runs an open-ended window to the edge and says its end is not known", () => {
    const { rows } = chart([program("a", [upcoming("2027-02-01", "month")])]);

    expect(rows[0]?.bars[0]).toMatchObject({ endPct: 100, endKnown: false });
  });

  it("starts an already-open window at the left edge and says it began earlier", () => {
    const earlier = window({ status: "open", opensOn: "2026-09-01", opensPrecision: "day", closesOn: "2026-11-30", closesPrecision: "day" });
    const undated = window({ status: "open" });

    const { rows } = chart([program("a", [earlier]), program("b", [undated])]);

    for (const row of rows) {
      expect(row.bars[0]).toMatchObject({ startPct: 0, startsBefore: true });
    }
    expect(rows).toHaveLength(2);
  });

  it("stops a window that closes beyond the axis at the right edge", () => {
    const { rows } = chart([program("a", [upcoming("2027-06-01", "month", "2027-12-01", "day")])]);

    expect(rows[0]?.bars[0]).toMatchObject({ endPct: 100, endKnown: true });
  });

  it("keeps a one-day window visible", () => {
    const { rows } = chart([program("a", [upcoming("2026-11-15", "day", "2026-11-15", "day")])]);

    const bar = rows[0]?.bars[0];
    expect((bar?.endPct ?? 0) - (bar?.startPct ?? 0)).toBeGreaterThanOrEqual(1);
  });

  it("never draws an estimated date as a stated one", () => {
    const estimatedOpening = window({ status: "upcoming", opensOn: "2026-12-01", opensPrecision: "estimated" });
    const estimatedClosing = window({
      status: "upcoming",
      opensOn: "2026-12-01",
      opensPrecision: "day",
      closesOn: "2027-01-31",
      closesPrecision: "estimated",
    });

    const result = chart([program("a", [estimatedOpening]), program("b", [estimatedClosing])]);

    expect(result.undated.map((entry) => entry.program.slug)).toEqual(["a"]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.bars[0]).toMatchObject({ endPct: 100, endKnown: false });
  });

  it("does not draw a bar for a date beyond the year, or for a window with no opening date", () => {
    const result = chart([
      program("far", [upcoming("2027-10-01", "month")]),
      program("undated", [window({ status: "upcoming" })]),
    ]);

    expect(result.rows).toEqual([]);
    expect(result.later.map((entry) => entry.program.slug)).toEqual(["far"]);
    expect(result.undated.map((entry) => entry.program.slug)).toEqual(["undated"]);
  });
});

describe("chartFor: guesses from past cycles", () => {
  it("draws a dashed bar over the months the past window stayed open", () => {
    const { rows } = chart([program("a", [pastSpan("2025-08-12", "2025-09-08")])]);

    expect(rows[0]?.bars).toEqual([
      { kind: "usual", startPct: pct(10), endPct: pct(12), startsBefore: false, endKnown: true },
    ]);
  });

  it("draws just the opening month when the past window gave no closing date", () => {
    const { rows } = chart([program("a", [pastSpan("2025-08-12", null)])]);

    expect(rows[0]?.bars).toEqual([
      { kind: "usual", startPct: pct(10), endPct: pct(11), startsBefore: false, endKnown: false },
    ]);
  });

  it("gives a program with two expected windows one row with two bars", () => {
    const { rows } = chart([program("a", [pastSpan("2025-03-01", "2025-04-01", 1), pastSpan("2025-08-12", "2025-09-08", 2)])]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.bars.map((bar) => bar.kind)).toEqual(["usual", "usual"]);
  });
});

describe("chartFor: rows and the programs left off the chart", () => {
  it("orders rows by where their first bar starts, then by name", () => {
    const { rows } = chart([
      program("late", [upcoming("2027-03-01", "month")], "Zed"),
      program("early-b", [upcoming("2026-11-01", "month")], "Beta"),
      program("early-a", [upcoming("2026-11-01", "month")], "Alpha"),
      program("open", [window({ status: "open" })], "Open"),
    ]);

    expect(rows.map((row) => row.entry.program.slug)).toEqual(["open", "early-a", "early-b", "late"]);
  });

  it("carries the saved flag to the row", () => {
    const { rows } = chart([program("a", [upcoming("2026-11-01", "month")]), program("b", [upcoming("2026-12-01", "month")])], ["id-b"]);

    expect(rows.map((row) => row.entry.saved)).toEqual([false, true]);
  });

  it("lists programs with nothing to draw separately, in alphabetical order", () => {
    const { noDate } = chart([program("b"), program("a")]);

    expect(noDate.map((entry) => entry.program.slug)).toEqual(["a", "b"]);
  });

  it("puts every program in exactly one place", () => {
    const programs = [
      program("open", [window({ status: "open" })]),
      program("soon", [upcoming("2026-12-01", "month")]),
      program("far", [upcoming("2028-01-01", "month")]),
      program("undated", [window({ status: "upcoming" })]),
      program("usual", [pastSpan("2025-08-12", "2025-09-08")]),
      program("none"),
    ];

    const result = chart(programs);
    const slugs = [
      ...result.rows.map((row) => row.entry.program.slug),
      ...result.later.map((entry) => entry.program.slug),
      ...result.undated.map((entry) => entry.program.slug),
      ...result.noDate.map((entry) => entry.program.slug),
    ];

    expect([...slugs].sort()).toEqual(["far", "none", "open", "soon", "undated", "usual"]);
  });
});
