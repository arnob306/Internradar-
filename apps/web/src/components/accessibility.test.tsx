// @vitest-environment jsdom
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it } from "vitest";
import { buildTimeline, type TimelineProgram, type TimelineWindow } from "../features/timeline/build-timeline";
import { chartFor } from "../features/timeline/timeline-bars";
import type { PublicProgram } from "../server/programs/programs-handler";
import { ProgramDetail } from "./ProgramDetail";
import { TimelineChart } from "./TimelineChart";
import { TimelineFilters } from "./TimelineFilters";

const TODAY = "2026-10-08";

/** axe's WCAG A and AA rules. Colour contrast needs real layout, so it is checked in the browser pass. */
async function violationsIn(container: HTMLElement): Promise<string[]> {
  const result = await axe.run(container, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
    rules: { "color-contrast": { enabled: false } },
  });
  return result.violations.map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.length})`);
}

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

function timelineProgram(slug: string, windows: TimelineWindow[] = []): TimelineProgram {
  return {
    id: `id-${slug}`,
    slug,
    name: `Program ${slug}`,
    programType: "graduate",
    company: { slug: `co-${slug}`, name: `Company ${slug}`, careersUrl: "https://example.com/careers" },
    windows,
  };
}

function detailProgram(overrides: Partial<PublicProgram> = {}): PublicProgram {
  return {
    id: "p1",
    slug: "graduate-program",
    name: "EY Graduate Program",
    programType: "graduate",
    cities: ["melbourne"],
    disciplines: [],
    sourceUrl: "https://www.ey.com/en_au/careers/2027-graduate-program-student-opportunities",
    company: { slug: "ey-australia", name: "EY Australia", careersUrl: "https://www.ey.com" },
    status: "open",
    windows: [],
    rulesVerified: true,
    applicationStages: [],
    ...overrides,
  };
}

describe("accessibility: the timeline", () => {
  it("has no WCAG A or AA violations in the filter bar, with or without a filter chosen", async () => {
    const all = render(<TimelineFilters current={undefined} />);
    expect(await violationsIn(all.container)).toEqual([]);
    all.unmount();

    const graduate = render(<TimelineFilters current="graduate" />);
    expect(await violationsIn(graduate.container)).toEqual([]);
  });

  it("has no violations in a chart with every kind of row", async () => {
    const programs = [
      timelineProgram("confirmed", [
        window({ status: "upcoming", opensOn: "2026-11-15", opensPrecision: "day", closesOn: "2026-12-15", closesPrecision: "day" }),
      ]),
      timelineProgram("open", [window({ status: "open" })]),
      timelineProgram("estimated", [
        window({ cycleYear: 2026, status: "closed", opensOn: "2025-08-12", opensPrecision: "day", closesOn: "2025-09-08", closesPrecision: "day" }),
      ]),
      timelineProgram("later", [window({ status: "upcoming", opensOn: "2028-01-01", opensPrecision: "day" })]),
      timelineProgram("undated", [window({ status: "upcoming" })]),
      timelineProgram("none"),
    ];

    const { container } = render(<TimelineChart chart={chartFor(buildTimeline(programs, TODAY, ["id-open"]), TODAY)} />);

    expect(await violationsIn(container)).toEqual([]);
  });

  it("has no violations when there is nothing to chart", async () => {
    const { container } = render(<TimelineChart chart={chartFor(buildTimeline([], TODAY, []), TODAY)} />);

    expect(await violationsIn(container)).toEqual([]);
  });

  it("lets a keyboard reach every filter in reading order", async () => {
    const user = userEvent.setup();
    const { getAllByRole } = render(<TimelineFilters current={undefined} />);
    const links = getAllByRole("link");

    const reached: (string | null)[] = [];
    for (let i = 0; i < links.length; i += 1) {
      await user.tab();
      reached.push(document.activeElement?.textContent ?? null);
    }

    expect(reached).toEqual(["All programs", "Graduate", "Vacationer"]);
  });
});

describe("accessibility: a program page", () => {
  const stages = [
    { name: "Online application", description: "Submit your CV.", sourceUrl: "https://www.ey.com/en_au/careers/early-careers-recruitment-hub" },
    { name: "Interview", description: "Meet the team.", sourceUrl: "https://www.ey.com/en_au/careers/early-careers-recruitment-hub" },
  ];

  it("has no violations with application stages", async () => {
    const { container } = render(<ProgramDetail program={detailProgram({ applicationStages: stages })} />);

    expect(await violationsIn(container)).toEqual([]);
  });

  it("has no violations when stages are not published", async () => {
    const { container } = render(<ProgramDetail program={detailProgram()} />);

    expect(await violationsIn(container)).toEqual([]);
  });

  it("has no violations for a saved program with a window", async () => {
    const program = detailProgram({
      windows: [
        {
          cycleYear: 2027,
          windowSeq: 1,
          opensOn: "2026-11-15",
          opensPrecision: "day",
          closesOn: "2026-12-15",
          closesPrecision: "day",
          programStartsOn: null,
          programEndsOn: null,
          status: "upcoming",
          sourceUrl: "https://example.com/w",
        },
      ],
      status: "upcoming",
    });

    const { container } = render(<ProgramDetail program={program} saved />);

    expect(await violationsIn(container)).toEqual([]);
  });
});
