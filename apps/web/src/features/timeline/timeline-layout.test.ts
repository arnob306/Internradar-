import { describe, expect, it } from "vitest";
import { buildTimeline, type TimelineProgram, type TimelineWindow } from "./build-timeline";
import { layoutTimeline } from "./timeline-layout";

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

function program(slug: string, windows: TimelineWindow[] = []): TimelineProgram {
  return {
    id: `id-${slug}`,
    slug,
    name: `Program ${slug}`,
    programType: "graduate",
    company: { slug: `co-${slug}`, name: `Company ${slug}`, careersUrl: "https://example.com/careers" },
    windows,
  };
}

const upcoming = (opensOn: string, opensPrecision: "day" | "month" = "day") =>
  window({ status: "upcoming", opensOn, opensPrecision });
const past = (cycleYear: number, opensOn: string, windowSeq = 1) =>
  window({ cycleYear, windowSeq, opensOn, opensPrecision: "month", status: "closed" });

const layout = (programs: TimelineProgram[]) => layoutTimeline(buildTimeline(programs, TODAY, []), TODAY);

describe("layoutTimeline", () => {
  it("puts programs that are open now in their own group, before any month", () => {
    const result = layout([program("a", [window({ status: "open", opensOn: "2026-09-01", opensPrecision: "day" })])]);

    expect(result.now.map((entry) => entry.program.slug)).toEqual(["a"]);
    expect(result.months).toEqual([]);
  });

  it("counts an open program as open now even with no stated opening date, or one in the current month", () => {
    const result = layout([
      program("undated-open", [window({ status: "open" })]),
      program("this-month", [window({ status: "open", opensOn: "2026-10-01", opensPrecision: "day" })]),
    ]);

    expect(result.now.map((entry) => entry.program.slug).sort()).toEqual(["this-month", "undated-open"]);
    expect(result.undated).toEqual([]);
    expect(result.months).toEqual([]);
  });

  it("places a confirmed upcoming program under the month it opens in", () => {
    const result = layout([program("a", [upcoming("2026-11-15")])]);

    expect(result.months).toHaveLength(1);
    expect(result.months[0]).toMatchObject({ year: 2026, month: 11 });
    expect(result.months[0]?.confirmed.map((entry) => entry.program.slug)).toEqual(["a"]);
    expect(result.months[0]?.usual).toEqual([]);
  });

  it("places a month-precision date under that month", () => {
    const result = layout([program("a", [upcoming("2027-02-01", "month")])]);

    expect(result.months[0]).toMatchObject({ year: 2027, month: 2 });
  });

  it("places a usually-opens-around program under the month it is next expected", () => {
    const result = layout([program("a", [past(2026, "2025-08-01")])]);

    expect(result.months[0]).toMatchObject({ year: 2027, month: 8 });
    expect(result.months[0]?.usual.map((entry) => entry.program.slug)).toEqual(["a"]);
  });

  it("shows a program under each month it is expected, when past cycles gave two", () => {
    const result = layout([program("a", [past(2026, "2025-03-01", 1), past(2026, "2025-08-01", 2)])]);

    expect(result.months.map((group) => [group.year, group.month])).toEqual([
      [2027, 3],
      [2027, 8],
    ]);
  });

  it("lists months in time order, only those with something in them, and keeps confirmed apart from usual", () => {
    const result = layout([
      program("usual-aug", [past(2026, "2025-08-01")]),
      program("sure-nov", [upcoming("2026-11-02")]),
      program("usual-nov", [past(2026, "2025-11-01")]),
    ]);

    expect(result.months.map((group) => [group.year, group.month])).toEqual([
      [2026, 11],
      [2027, 8],
    ]);
    expect(result.months[0]?.confirmed.map((entry) => entry.program.slug)).toEqual(["sure-nov"]);
    expect(result.months[0]?.usual.map((entry) => entry.program.slug)).toEqual(["usual-nov"]);
  });

  it("puts a confirmed date more than a year away under later, not on the timeline", () => {
    const result = layout([program("a", [upcoming("2027-11-01", "month")])]);

    expect(result.months).toEqual([]);
    expect(result.later.map((entry) => entry.program.slug)).toEqual(["a"]);
  });

  it("includes the last month of the year ahead and excludes the one after it", () => {
    const inside = layout([program("in", [upcoming("2027-09-01", "month")])]);
    const outside = layout([program("out", [upcoming("2027-10-01", "month")])]);

    expect(inside.months).toHaveLength(1);
    expect(outside.later).toHaveLength(1);
  });

  it("does not lose a program whose upcoming window has no opening date", () => {
    const result = layout([program("a", [window({ status: "upcoming" })])]);

    expect(result.undated.map((entry) => entry.program.slug)).toEqual(["a"]);
    expect(result.months).toEqual([]);
  });

  it("keeps the programs with no date, unchanged and in order", () => {
    const result = layout([program("b"), program("a")]);

    expect(result.noDate.map((entry) => entry.program.slug)).toEqual(["a", "b"]);
  });

  it("accounts for every program exactly once, except those shown under two months", () => {
    const programs = [
      program("open", [window({ status: "open" })]),
      program("soon", [upcoming("2026-12-01")]),
      program("far", [upcoming("2028-01-01", "month")]),
      program("undated", [window({ status: "upcoming" })]),
      program("usual", [past(2026, "2025-08-01")]),
      program("none"),
    ];

    const result = layout(programs);
    const slugs = [
      ...result.now,
      ...result.months.flatMap((group) => [...group.confirmed, ...group.usual]),
      ...result.later,
      ...result.undated,
      ...result.noDate,
    ].map((entry) => entry.program.slug);

    expect([...slugs].sort()).toEqual(["far", "none", "open", "soon", "undated", "usual"]);
  });
});
