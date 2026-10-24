import { describe, expect, it } from "vitest";
import type { Timeline, TimelineProgram } from "./build-timeline";
import { summariseTimeline } from "./summarise";

const program = (slug: string): TimelineProgram => ({
  id: slug,
  slug,
  name: slug,
  programType: "graduate",
  company: { slug: `co-${slug}`, name: slug, careersUrl: "https://example.com" },
  windows: [],
});

const confirmed = (slug: string, windowStatus: "open" | "upcoming") => ({
  kind: "confirmed" as const,
  program: program(slug),
  saved: false,
  windowStatus,
  cycleYear: 2027,
  opensOn: null,
  opensPrecision: null,
  closesOn: null,
  closesPrecision: null,
});

const usual = (slug: string) => ({
  kind: "usual" as const,
  program: program(slug),
  saved: false,
  occurrences: [],
  spans: [],
  basedOn: [],
});

const none = (slug: string) => ({ kind: "none" as const, program: program(slug), saved: false });

describe("summariseTimeline", () => {
  it("counts programs open now, opening soon, estimated and not announced", () => {
    const timeline: Timeline = {
      confirmed: [confirmed("a", "open"), confirmed("b", "open"), confirmed("c", "upcoming")],
      usual: [usual("d")],
      none: [none("e"), none("f"), none("g")],
    };

    expect(summariseTimeline(timeline)).toEqual({
      total: 7,
      openNow: 2,
      openingSoon: 1,
      estimated: 1,
      notAnnounced: 3,
    });
  });

  it("is all zeros for an empty timeline", () => {
    expect(summariseTimeline({ confirmed: [], usual: [], none: [] })).toEqual({
      total: 0,
      openNow: 0,
      openingSoon: 0,
      estimated: 0,
      notAnnounced: 0,
    });
  });
});
