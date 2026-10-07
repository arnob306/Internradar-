import type { ConfirmedEntry, NoDateEntry, Timeline, UsualEntry } from "./build-timeline";

export interface MonthGroup {
  readonly year: number;
  readonly month: number;
  /** Dates the employer has stated for this month. */
  readonly confirmed: readonly ConfirmedEntry[];
  /** Programs that usually open around this month, going by past cycles. */
  readonly usual: readonly UsualEntry[];
}

export interface TimelineLayout {
  /** Open now (or its opening month has already passed). */
  readonly now: readonly ConfirmedEntry[];
  /** The next twelve months, in order, leaving out months with nothing in them. */
  readonly months: readonly MonthGroup[];
  /** A stated opening date more than a year away. */
  readonly later: readonly ConfirmedEntry[];
  /** Marked as opening soon, but the employer has not said when. */
  readonly undated: readonly ConfirmedEntry[];
  /** Neither a stated date nor a past opening to go by. */
  readonly noDate: readonly NoDateEntry[];
}

const MONTHS_AHEAD = 12;

/** A month as a single number, so months can be compared and counted across a year end. */
const monthIndex = (year: number, month: number): number => year * 12 + (month - 1);
const indexOfDate = (isoDate: string): number => monthIndex(Number(isoDate.slice(0, 4)), Number(isoDate.slice(5, 7)));

/**
 * Arranges the timeline groups for the page: what is open now, then each month of the year ahead,
 * with stated dates kept apart from "usually opens around" guesses. `today` is the Melbourne date.
 */
export function layoutTimeline(timeline: Timeline, today: string): TimelineLayout {
  const start = indexOfDate(today);
  const end = start + MONTHS_AHEAD - 1;

  const now: ConfirmedEntry[] = [];
  const later: ConfirmedEntry[] = [];
  const undated: ConfirmedEntry[] = [];
  const confirmedIn = new Map<number, ConfirmedEntry[]>();
  const usualIn = new Map<number, UsualEntry[]>();
  const add = <T>(groups: Map<number, T[]>, index: number, entry: T): void => {
    groups.set(index, [...(groups.get(index) ?? []), entry]);
  };

  for (const entry of timeline.confirmed) {
    const opensIndex = entry.opensOn === null ? null : indexOfDate(entry.opensOn);
    if (entry.windowStatus === "open" || (opensIndex !== null && opensIndex < start)) {
      now.push(entry);
    } else if (opensIndex === null) {
      undated.push(entry);
    } else if (opensIndex > end) {
      later.push(entry);
    } else {
      add(confirmedIn, opensIndex, entry);
    }
  }
  for (const entry of timeline.usual) {
    for (const occurrence of entry.occurrences) {
      add(usualIn, monthIndex(occurrence.year, occurrence.month), entry);
    }
  }

  const months: MonthGroup[] = [];
  for (let index = start; index <= end; index++) {
    const confirmed = confirmedIn.get(index) ?? [];
    const usual = usualIn.get(index) ?? [];
    if (confirmed.length > 0 || usual.length > 0) {
      months.push({ year: Math.floor(index / 12), month: (index % 12) + 1, confirmed, usual });
    }
  }

  return { now, months, later, undated, noDate: timeline.none };
}
