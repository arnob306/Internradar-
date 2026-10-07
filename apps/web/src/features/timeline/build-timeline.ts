import type { WindowStatus } from "../../components/StatusChip";
import type { PublicProgram } from "../../server/programs/programs-handler";
import { headlineWindow } from "../programs/headline-window";

type Precision = "day" | "month" | "estimated" | null;

/** The parts of an application window the timeline needs. Dates are ISO `YYYY-MM-DD` strings. */
export interface TimelineWindow {
  readonly cycleYear: number;
  readonly windowSeq: number;
  readonly opensOn: string | null;
  readonly opensPrecision: Precision;
  readonly closesOn: string | null;
  readonly closesPrecision: Precision;
  readonly status: WindowStatus;
  readonly sourceUrl: string;
}

export type TimelineProgram = Pick<PublicProgram, "id" | "slug" | "name" | "programType" | "company"> & {
  readonly windows: readonly TimelineWindow[];
};

/** A month in a year. Never a day: a past opening only proves the month it happened in. */
export interface MonthInYear {
  readonly year: number;
  readonly month: number;
}

export interface ConfirmedEntry {
  readonly kind: "confirmed";
  readonly program: TimelineProgram;
  readonly saved: boolean;
  readonly windowStatus: "open" | "upcoming";
  readonly cycleYear: number;
  readonly opensOn: string | null;
  readonly opensPrecision: Precision;
  readonly closesOn: string | null;
  readonly closesPrecision: Precision;
}

/** When a past window usually runs, as months only. `end` is null when the past window gave no closing month. */
export interface MonthSpan {
  readonly start: MonthInYear;
  readonly end: MonthInYear | null;
}

export interface UsualEntry {
  readonly kind: "usual";
  readonly program: TimelineProgram;
  readonly saved: boolean;
  /** The next time each month that past cycles opened in comes round, soonest first. */
  readonly occurrences: readonly MonthInYear[];
  /** The same months as `occurrences`, with how long each past window stayed open when that was stated. */
  readonly spans: readonly MonthSpan[];
  /** The past cycles this is based on, newest first, each with where the date came from. */
  readonly basedOn: readonly { readonly cycleYear: number; readonly sourceUrl: string }[];
}

export interface NoDateEntry {
  readonly kind: "none";
  readonly program: TimelineProgram;
  readonly saved: boolean;
}

export interface Timeline {
  readonly confirmed: readonly ConfirmedEntry[];
  readonly usual: readonly UsualEntry[];
  readonly none: readonly NoDateEntry[];
}

// How many past cycles back an estimate may look (decision D19: one or two).
const CYCLES_USED = 2;

const byName = (a: TimelineProgram, b: TimelineProgram): number => a.name.localeCompare(b.name);

/** An opening date that really happened and is stated as a day or a month (an estimate proves nothing). */
function isPastEvidence(window: TimelineWindow, today: string): window is TimelineWindow & { opensOn: string } {
  return (
    window.opensOn !== null &&
    (window.opensPrecision === "day" || window.opensPrecision === "month") &&
    window.opensOn <= today
  );
}

const monthIndex = (year: number, month: number): number => year * 12 + (month - 1);
const fromIndex = (index: number): MonthInYear => ({ year: Math.floor(index / 12), month: (index % 12) + 1 });
const indexOfDate = (isoDate: string): number => monthIndex(Number(isoDate.slice(0, 4)), Number(isoDate.slice(5, 7)));

/**
 * Each past window as the months it ran, moved to its next occurrence. The length is the number of
 * months between the opening and closing month; a closing date that is only an estimate is not used.
 */
function spansOf(windows: readonly (TimelineWindow & { opensOn: string })[], todayYear: number, todayMonth: number): MonthSpan[] {
  const spans = new Map<string, MonthSpan & { readonly key: number }>();
  for (const window of windows) {
    const opensIndex = indexOfDate(window.opensOn);
    const month = (opensIndex % 12) + 1;
    const start = monthIndex(month >= todayMonth ? todayYear : todayYear + 1, month);
    const closesStated =
      window.closesOn !== null && (window.closesPrecision === "day" || window.closesPrecision === "month");
    const length = closesStated && window.closesOn !== null ? indexOfDate(window.closesOn) - opensIndex : -1;
    const end = length >= 0 ? fromIndex(start + length) : null;
    spans.set(`${start}-${length}`, { start: fromIndex(start), end, key: start });
  }
  return [...spans.values()].sort((a, b) => a.key - b.key).map(({ start, end }) => ({ start, end }));
}

function usualFor(program: TimelineProgram, today: string, saved: boolean): UsualEntry | null {
  const evidence = program.windows.filter((window) => isPastEvidence(window, today));
  const cycles = [...new Set(evidence.map((window) => window.cycleYear))].sort((a, b) => b - a).slice(0, CYCLES_USED);
  if (cycles.length === 0) {
    return null;
  }

  const used = evidence.filter((window) => cycles.includes(window.cycleYear));
  const todayYear = Number(today.slice(0, 4));
  const todayMonth = Number(today.slice(5, 7));
  const months = [...new Set(used.map((window) => Number(window.opensOn?.slice(5, 7))))];
  const occurrences = months
    .map((month) => ({ year: month >= todayMonth ? todayYear : todayYear + 1, month }))
    .sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));

  const spans = spansOf(used, todayYear, todayMonth);

  const basedOn = cycles.map((cycleYear) => {
    const first = used
      .filter((window) => window.cycleYear === cycleYear)
      .sort((a, b) => a.windowSeq - b.windowSeq)[0];
    return { cycleYear, sourceUrl: first?.sourceUrl ?? "" };
  });
  return { kind: "usual", program, saved, occurrences, spans, basedOn };
}

function confirmedFor(program: TimelineProgram, saved: boolean): ConfirmedEntry | null {
  const headline = headlineWindow(program.windows);
  if (headline === undefined || (headline.status !== "open" && headline.status !== "upcoming")) {
    return null;
  }
  return {
    kind: "confirmed",
    program,
    saved,
    windowStatus: headline.status,
    cycleYear: headline.cycleYear,
    opensOn: headline.opensOn,
    opensPrecision: headline.opensPrecision,
    closesOn: headline.closesOn,
    closesPrecision: headline.closesPrecision,
  };
}

const confirmedOrder = (a: ConfirmedEntry, b: ConfirmedEntry): number => {
  if ((a.windowStatus === "open") !== (b.windowStatus === "open")) {
    return a.windowStatus === "open" ? -1 : 1;
  }
  if (a.opensOn !== b.opensOn) {
    return a.opensOn === null ? 1 : b.opensOn === null ? -1 : a.opensOn < b.opensOn ? -1 : 1;
  }
  return byName(a.program, b.program);
};

const firstOccurrence = (entry: UsualEntry): number => {
  const first = entry.occurrences[0];
  return first === undefined ? Number.MAX_SAFE_INTEGER : first.year * 12 + first.month;
};

/**
 * Lays programs out for the timeline page (decision D19). Each program lands in exactly one group:
 * confirmed (the employer's own dates), usually-opens-around (the months past cycles opened in,
 * never more precise than they were stated), or no date yet. `today` is the Melbourne date.
 */
export function buildTimeline(
  programs: readonly TimelineProgram[],
  today: string,
  savedProgramIds: readonly string[],
): Timeline {
  const confirmed: ConfirmedEntry[] = [];
  const usual: UsualEntry[] = [];
  const none: NoDateEntry[] = [];

  for (const program of programs) {
    const saved = savedProgramIds.includes(program.id);
    const entry = confirmedFor(program, saved) ?? usualFor(program, today, saved);
    if (entry === null) {
      none.push({ kind: "none", program, saved });
    } else if (entry.kind === "confirmed") {
      confirmed.push(entry);
    } else {
      usual.push(entry);
    }
  }

  return {
    confirmed: confirmed.sort(confirmedOrder),
    usual: usual.sort((a, b) => firstOccurrence(a) - firstOccurrence(b) || byName(a.program, b.program)),
    none: none.sort((a, b) => byName(a.program, b.program)),
  };
}
