import type { ConfirmedEntry, MonthInYear, NoDateEntry, Timeline, UsualEntry } from "./build-timeline";

export interface AxisMonth {
  readonly year: number;
  readonly month: number;
}

/** One bar on a program's row. Positions are percentages of the axis width, 0 at the left edge. */
export interface Bar {
  /** A stated window is drawn solid; a guess from past cycles is drawn dashed. */
  readonly kind: "confirmed" | "usual";
  readonly startPct: number;
  readonly endPct: number;
  /** The window opened before the axis starts, so its left edge is cut off. */
  readonly startsBefore: boolean;
  /** False when nobody has said when it closes, so the right end is drawn as open. */
  readonly endKnown: boolean;
}

export interface ChartRow {
  readonly entry: ConfirmedEntry | UsualEntry;
  readonly bars: readonly Bar[];
}

export interface Chart {
  /** The twelve months shown, starting with the current month. */
  readonly axis: readonly AxisMonth[];
  readonly todayPct: number;
  readonly rows: readonly ChartRow[];
  /** A stated opening date beyond the twelve months. */
  readonly later: readonly ConfirmedEntry[];
  /** Marked as opening soon, but the employer has not said when. */
  readonly undated: readonly ConfirmedEntry[];
  readonly noDate: readonly NoDateEntry[];
}

const MONTHS_SHOWN = 12;
// A window of a single day would be a hairline; this keeps every bar visible.
const MIN_WIDTH_PCT = 1;

type Precision = "day" | "month" | "estimated" | null;

const monthIndex = (year: number, month: number): number => year * 12 + (month - 1);

function daysInMonth(year: number, month: number): number {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 31;
}

/** Only a day or a month is a stated date; an estimate proves nothing and is never drawn as one. */
const isStated = (precision: Precision): precision is "day" | "month" => precision === "day" || precision === "month";

interface Parts {
  readonly index: number;
  readonly day: number;
  readonly daysInMonth: number;
}

function partsOf(isoDate: string): Parts {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  return { index: monthIndex(year, month), day: Number(isoDate.slice(8, 10)), daysInMonth: daysInMonth(year, month) };
}

const toPct = (months: number): number => (Math.min(MONTHS_SHOWN, Math.max(0, months)) / MONTHS_SHOWN) * 100;

/** A confirmed window as a bar, or where it goes instead: "later" beyond the year, "undated" with no opening. */
function confirmedBar(entry: ConfirmedEntry, axisStart: number): Bar | "later" | "undated" {
  let startMonths: number;
  let startsBefore: boolean;
  if (entry.opensOn !== null && isStated(entry.opensPrecision)) {
    const opens = partsOf(entry.opensOn);
    startMonths = opens.index - axisStart + (entry.opensPrecision === "day" ? (opens.day - 1) / opens.daysInMonth : 0);
    startsBefore = startMonths < 0;
  } else if (entry.windowStatus === "open") {
    startMonths = 0;
    startsBefore = true;
  } else {
    return "undated";
  }
  if (startMonths >= MONTHS_SHOWN) {
    return "later";
  }

  const startPct = toPct(startMonths);
  let endMonths = MONTHS_SHOWN;
  let endKnown = false;
  if (entry.closesOn !== null && isStated(entry.closesPrecision)) {
    const closes = partsOf(entry.closesOn);
    endMonths = closes.index - axisStart + (entry.closesPrecision === "day" ? closes.day / closes.daysInMonth : 1);
    endKnown = true;
  }
  const endPct = Math.min(100, Math.max(toPct(endMonths), startPct + MIN_WIDTH_PCT));
  return { kind: "confirmed", startPct, endPct, startsBefore, endKnown };
}

/** The months a guess is expected to run, as dashed bars: the opening month through the closing month. */
function usualBars(entry: UsualEntry, axisStart: number): Bar[] {
  return entry.spans.map((span) => {
    const start = monthIndex(span.start.year, span.start.month) - axisStart;
    const end = span.end === null ? start + 1 : monthIndex(span.end.year, span.end.month) - axisStart + 1;
    return { kind: "usual", startPct: toPct(start), endPct: toPct(end), startsBefore: false, endKnown: span.end !== null };
  });
}

const firstStart = (row: ChartRow): number => row.bars[0]?.startPct ?? 0;

/**
 * Turns the timeline groups into a year chart: one row per program with a bar over the months its
 * applications are open. `today` is the Melbourne date; the axis starts at the current month.
 */
export function chartFor(timeline: Timeline, today: string): Chart {
  const todayParts = partsOf(today);
  const axisStart = todayParts.index;
  const axis: AxisMonth[] = Array.from({ length: MONTHS_SHOWN }, (_, offset): MonthInYear => {
    const index = axisStart + offset;
    return { year: Math.floor(index / 12), month: (index % 12) + 1 };
  });

  const rows: ChartRow[] = [];
  const later: ConfirmedEntry[] = [];
  const undated: ConfirmedEntry[] = [];
  for (const entry of timeline.confirmed) {
    const bar = confirmedBar(entry, axisStart);
    if (bar === "later") {
      later.push(entry);
    } else if (bar === "undated") {
      undated.push(entry);
    } else {
      rows.push({ entry, bars: [bar] });
    }
  }
  for (const entry of timeline.usual) {
    rows.push({ entry, bars: usualBars(entry, axisStart) });
  }

  return {
    axis,
    todayPct: toPct((todayParts.day - 1) / todayParts.daysInMonth),
    rows: rows.sort((a, b) => firstStart(a) - firstStart(b) || a.entry.program.name.localeCompare(b.entry.program.name)),
    later,
    undated,
    noDate: timeline.none,
  };
}
