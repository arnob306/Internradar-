// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildTimeline, type TimelineProgram, type TimelineWindow } from "../features/timeline/build-timeline";
import { chartFor } from "../features/timeline/timeline-bars";
import { TimelineChart } from "./TimelineChart";

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

const upcoming = (opensOn: string, closesOn: string | null = null) =>
  window({
    status: "upcoming",
    opensOn,
    opensPrecision: "day",
    closesOn,
    closesPrecision: closesOn === null ? null : "day",
  });

const past = (opensOn: string, closesOn: string | null, sourceUrl = "https://example.com/2026", cycleYear = 2026, windowSeq = 1) =>
  window({
    cycleYear,
    windowSeq,
    opensOn,
    opensPrecision: "day",
    closesOn,
    closesPrecision: closesOn === null ? null : "day",
    status: "closed",
    sourceUrl,
  });

function show(programs: TimelineProgram[], saved: string[] = []) {
  return render(<TimelineChart chart={chartFor(buildTimeline(programs, TODAY, saved), TODAY)} />);
}

const bars = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>("[data-bar]")];
const num = (value: string) => Number.parseFloat(value);

describe("TimelineChart: the year", () => {
  it("labels the twelve months, with the year where it starts and at each January", () => {
    show([program("a", [upcoming("2026-11-15")])]);

    const table = screen.getByRole("table", { name: "Applications over the next twelve months" });
    for (const label of ["Oct 2026", "Nov", "Dec", "Jan 2027", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"]) {
      expect(within(table).getByText(label)).toBeTruthy();
    }
  });

  it("marks today on the axis", () => {
    const { container } = show([program("a", [upcoming("2026-11-15")])]);

    const marker = container.querySelector<HTMLElement>("[data-today]");
    expect(marker).not.toBeNull();
    expect(num(marker?.style.left ?? "")).toBeCloseTo((7 / 31 / 12) * 100, 2);
  });

  it("explains that solid bars are published dates and dashed bars are guesses", () => {
    show([program("a", [upcoming("2026-11-15")])]);

    const note = screen.getByRole("note");
    expect(note.textContent).toMatch(/solid/i);
    expect(note.textContent).toMatch(/dashed/i);
    expect(note.textContent).toMatch(/guess/i);
  });
});

describe("TimelineChart: the key", () => {
  it("shows what each kind of mark means, in words beside a small sample of it", () => {
    const { container } = show([program("a", [upcoming("2026-11-15")])]);

    const key = screen.getByRole("list", { name: "Key to the bars" });
    const labels = within(key)
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    expect(labels).toEqual([
      "Dates the employer published",
      "A guess from earlier years",
      "No closing date listed",
      "Today",
    ]);
    const samples = [...key.querySelectorAll<HTMLElement>("[data-swatch]")].map((sample) => sample.dataset["swatch"]);
    expect(samples).toEqual(["confirmed", "usual", "open-end", "today"]);
    expect(container.querySelectorAll("[data-swatch]")).toHaveLength(4);
  });

  it("draws the samples for the picture only, so a screen reader hears each label once", () => {
    const { container } = show([program("a", [upcoming("2026-11-15")])]);

    for (const sample of container.querySelectorAll("[data-swatch]")) {
      expect(sample.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("does not count the samples as bars on the chart", () => {
    const { container } = show([program("a", [upcoming("2026-11-15", "2026-12-15")])]);

    expect(bars(container)).toHaveLength(1);
  });

  it("leaves the key out when there is no chart to explain", () => {
    show([program("none")]);

    expect(screen.queryByRole("list", { name: "Key to the bars" })).toBeNull();
  });
});

describe("TimelineChart: rows and bars", () => {
  it("gives each program a row with a link to its page", () => {
    show([program("a", [upcoming("2026-11-15")], "Alpha Program")]);

    const row = screen.getByRole("row", { name: /Alpha Program/ });
    expect(within(row).getByRole("link", { name: "Alpha Program" }).getAttribute("href")).toBe("/programs/co-a/a");
  });

  it("escapes slugs in the link", () => {
    show([{ ...program("a", [upcoming("2026-11-15")]), slug: "a/b", company: { slug: "x y", name: "X", careersUrl: "https://x.example" } }]);

    expect(screen.getByRole("link", { name: "Program a" }).getAttribute("href")).toBe("/programs/x%20y/a%2Fb");
  });

  it("places a bar where the window is, as a share of the year", () => {
    const { container } = show([program("a", [upcoming("2026-11-15", "2026-12-15")])]);

    const [bar] = bars(container);
    expect(bar?.getAttribute("data-bar")).toBe("confirmed");
    expect(num(bar?.style.left ?? "")).toBeCloseTo(((1 + 14 / 30) / 12) * 100, 2);
    expect(num(bar?.style.width ?? "")).toBeCloseTo(((2 + 15 / 31) / 12 - (1 + 14 / 30) / 12) * 100, 2);
  });

  it("draws the bars for the picture only, since each row says its dates in words", () => {
    const { container } = show([program("a", [upcoming("2026-11-15", "2026-12-15")])]);

    const [bar] = bars(container);
    expect(bar?.closest("[aria-hidden='true']")).not.toBeNull();
    const row = screen.getByRole("row", { name: /Program a/ });
    expect(row.textContent).toContain("15 Nov 2026 to 15 Dec 2026");
  });

  it("marks a bar with no known end as open-ended, and one that began earlier as cut off", () => {
    const { container } = show([
      program("open", [window({ status: "open" })]),
      program("later", [upcoming("2026-12-01")]),
    ]);

    const byKind = bars(container);
    expect(byKind.every((bar) => bar.dataset["openEnd"] === "true")).toBe(true);
    expect(byKind.filter((bar) => bar.dataset["cutStart"] === "true")).toHaveLength(1);
  });

  it("draws a guess as a dashed bar and words it as a guess, with where it came from", () => {
    const { container } = show([program("a", [past("2025-08-12", "2025-09-08", "https://example.com/a-2026")])]);

    expect(bars(container)[0]?.getAttribute("data-bar")).toBe("usual");
    const row = screen.getByRole("row", { name: /Program a/ });
    expect(row.textContent).toContain("Usually opens around August");
    expect(row.textContent).toContain("Based on the 2026 intake");
    const link = within(row).getByRole("link", { name: "Source for the 2026 intake" });
    expect(link.getAttribute("href")).toBe("https://example.com/a-2026");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("names both months when a program is expected to open twice", () => {
    show([program("a", [past("2025-03-01", "2025-04-01", "https://example.com/x", 2026, 1), past("2025-08-12", "2025-09-08", "https://example.com/x", 2026, 2)])]);

    expect(screen.getByRole("row", { name: /Program a/ }).textContent).toContain("Usually opens around March or August");
  });

  it("never links to an unsafe address", () => {
    show([program("a", [past("2025-08-12", "2025-09-08", "javascript:alert(1)")])]);

    expect(screen.queryByRole("link", { name: /Source for/ })).toBeNull();
  });

  it("badges the programs the student saved, and no others", () => {
    show([program("a", [upcoming("2026-11-15")]), program("b", [upcoming("2026-12-01")])], ["id-b"]);

    const badged = screen.getAllByRole("row").filter((row) => within(row).queryByText("Saved") !== null);
    expect(badged).toHaveLength(1);
    expect(badged[0]?.textContent).toContain("Program b");
  });
});

describe("TimelineChart: programs off the chart", () => {
  it("lists far-off, undated and no-date programs under the chart, leaving out empty sections", () => {
    show([
      program("on", [upcoming("2026-11-15")]),
      program("far", [upcoming("2028-01-01")]),
      program("undated", [window({ status: "upcoming" })]),
      program("none"),
    ]);

    expect(within(screen.getByRole("region", { name: "Opening later" })).getByText("Program far")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Opening soon, date not listed" })).getByText("Program undated")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "No date yet" })).getByText("Program none")).toBeTruthy();
  });

  it("says so, without an empty chart, when nothing has a date in the next twelve months", () => {
    show([program("none")]);

    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText(/no program has a date/i)).toBeTruthy();
    expect(screen.getByRole("region", { name: "No date yet" })).toBeTruthy();
  });

  it("says so when there are no programs at all", () => {
    show([]);

    expect(screen.getByText(/no programs to show/i)).toBeTruthy();
  });
});
