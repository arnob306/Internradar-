// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  type TimelineProgram,
  type TimelineWindow,
} from "../features/timeline/build-timeline";
import { layoutTimeline } from "../features/timeline/timeline-layout";
import { TimelineView } from "./TimelineView";

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

const upcoming = (opensOn: string, opensPrecision: "day" | "month" = "day") =>
  window({ status: "upcoming", opensOn, opensPrecision });
const past = (cycleYear: number, opensOn: string, sourceUrl = `https://example.com/${cycleYear}`) =>
  window({ cycleYear, opensOn, opensPrecision: "month", status: "closed", sourceUrl });

function show(programs: TimelineProgram[], saved: string[] = []) {
  const layout = layoutTimeline(buildTimeline(programs, TODAY, saved), TODAY);
  return render(<TimelineView layout={layout} />);
}

describe("TimelineView: what it shows", () => {
  it("explains how to tell a stated date from a guess", () => {
    show([program("a", [upcoming("2026-11-15")])]);

    const note = screen.getByRole("note");
    expect(note.textContent).toMatch(/published/i);
    expect(note.textContent).toMatch(/guess|usual/i);
  });

  it("lists programs that are open now first, linking to each program", () => {
    show([program("a", [window({ status: "open" })], "Open Co Program")]);

    const section = screen.getByRole("region", { name: "Open now" });
    expect(within(section).getByRole("link", { name: "Open Co Program" }).getAttribute("href")).toBe("/programs/co-a/a");
  });

  it("escapes the slugs in program links", () => {
    show([{ ...program("a", [window({ status: "open" })]), slug: "a/b", company: { slug: "x y", name: "X", careersUrl: "https://x.example" } }]);

    expect(screen.getByRole("link", { name: "Program a" }).getAttribute("href")).toBe("/programs/x%20y/a%2Fb");
  });

  it("puts a stated date under its month, worded as exactly as it is known", () => {
    show([program("a", [upcoming("2026-11-15")]), program("b", [upcoming("2027-02-01", "month")])]);

    const november = screen.getByRole("region", { name: "November 2026" });
    expect(within(november).getByText(/15 Nov 2026/)).toBeTruthy();
    const february = screen.getByRole("region", { name: "February 2027" });
    expect(february.textContent).toMatch(/Feb 2027/);
    expect(february.textContent).not.toMatch(/\b1 Feb/);
  });

  it("marks a stated date and a guess differently, in words as well as style", () => {
    show([program("sure", [upcoming("2026-11-15")]), program("guess", [past(2026, "2025-11-01")])]);

    const november = screen.getByRole("region", { name: "November 2026" });
    const items = within(november).getAllByRole("listitem");
    const kinds = items.map((item) => item.getAttribute("data-kind"));
    expect(kinds.sort()).toEqual(["confirmed", "usual"]);
    expect(within(november).getByText("Usually opens around November")).toBeTruthy();
  });

  it("says which intakes a guess is based on and links where each came from", () => {
    show([program("a", [past(2026, "2025-08-01", "https://example.com/a-2026"), past(2025, "2024-08-01", "https://example.com/a-2025")])]);

    const august = screen.getByRole("region", { name: "August 2027" });
    expect(within(august).getByText(/Based on the 2026 and 2025 intakes/)).toBeTruthy();
    const link = within(august).getByRole("link", { name: "Source for the 2026 intake" });
    expect(link.getAttribute("href")).toBe("https://example.com/a-2026");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("never links to an unsafe address", () => {
    show([program("a", [past(2026, "2025-08-01", "javascript:alert(1)")])]);

    expect(screen.queryByRole("link", { name: /Source for/ })).toBeNull();
  });

  it("badges the programs the student saved, and no others", () => {
    show([program("a", [upcoming("2026-11-15")]), program("b", [upcoming("2026-11-20")])], ["id-a"]);

    const items = within(screen.getByRole("region", { name: "November 2026" })).getAllByRole("listitem");
    const badged = items.filter((item) => within(item).queryByText("Saved") !== null);
    expect(badged).toHaveLength(1);
    expect(badged[0]?.textContent).toContain("Program a");
  });

  it("shows far-off, undated and no-date programs in their own sections, and leaves out empty sections", () => {
    show([
      program("far", [upcoming("2028-01-01", "month")]),
      program("undated", [window({ status: "upcoming" })]),
      program("none"),
    ]);

    expect(screen.getByRole("region", { name: "Opening later" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Opening soon, date not listed" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "No date yet" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Open now" })).toBeNull();
  });

  it("says so when there are no programs at all", () => {
    show([]);

    expect(screen.getByText(/no programs/i)).toBeTruthy();
  });
});
