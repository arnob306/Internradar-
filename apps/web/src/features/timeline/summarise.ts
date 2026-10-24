import type { Timeline } from "./build-timeline";

export interface TimelineSummary {
  readonly total: number;
  /** Programs with a confirmed window that is open today. */
  readonly openNow: number;
  /** Programs with a confirmed window that has not opened yet. */
  readonly openingSoon: number;
  /** Programs with only a guess from earlier years. */
  readonly estimated: number;
  /** Programs with nothing to go on yet. */
  readonly notAnnounced: number;
}

/** Counts the programs in each state, for the numbers at the top of the home page. */
export function summariseTimeline(timeline: Timeline): TimelineSummary {
  const openNow = timeline.confirmed.filter((entry) => entry.windowStatus === "open").length;
  const openingSoon = timeline.confirmed.length - openNow;
  return {
    total: timeline.confirmed.length + timeline.usual.length + timeline.none.length,
    openNow,
    openingSoon,
    estimated: timeline.usual.length,
    notAnnounced: timeline.none.length,
  };
}
