import type { WindowStatus } from "../../components/StatusChip";

/** The columns of program_windows that decide a status. Dates are ISO `YYYY-MM-DD` strings. */
export interface StatusWindow {
  readonly status: WindowStatus;
  readonly opens_on: string | null;
  readonly opens_precision: "day" | "month" | "estimated" | null;
  readonly closes_on: string | null;
  readonly closes_precision: "day" | "month" | "estimated" | null;
}

/** The earliest and latest day a date could really mean, given how precisely it is known. */
interface DateRange {
  readonly earliest: string;
  readonly latest: string;
}

function lastDayOfMonth(isoDate: string): string {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 31;
  return `${isoDate.slice(0, 8)}${String(days).padStart(2, "0")}`;
}

/**
 * A day-precision date is exact. A month-precision date ("March") could be any day in that
 * month. An estimated date proves nothing, so it has no range at all.
 */
function rangeOf(date: string | null, precision: StatusWindow["opens_precision"]): DateRange | null {
  if (date === null) {
    return null;
  }
  if (precision === "day") {
    return { earliest: date, latest: date };
  }
  if (precision === "month") {
    const first = `${date.slice(0, 8)}01`;
    return { earliest: first, latest: lastDayOfMonth(first) };
  }
  return null;
}

/**
 * Whether one window is open, using only what its dates prove. ISO dates compare correctly as
 * strings. Anything the dates cannot settle falls back to the status stored in the database,
 * so the feed never claims more than the employer's page does.
 */
export function windowStatus(window: StatusWindow, today: string): WindowStatus {
  // "Closed" was recorded by someone who saw the employer say so (the seed, the monitor or an
  // admin). Dates can correct a stale "open", but they must never reopen a window that was
  // explicitly closed: that would be a false "open", the one claim this product must not make.
  if (window.status === "closed") {
    return "closed";
  }

  const opens = rangeOf(window.opens_on, window.opens_precision);
  const closes = rangeOf(window.closes_on, window.closes_precision);

  if (closes !== null && today > closes.latest) {
    return "closed";
  }
  if (opens !== null && today < opens.earliest) {
    return "upcoming";
  }
  // No closing date at all means rolling: open from the opening date. A closing date that is
  // only estimated is different: it may already have passed, so it settles nothing.
  const noClosingDate = window.closes_on === null && window.closes_precision === null;
  if (opens !== null && opens.latest <= today) {
    if (noClosingDate || (closes !== null && today <= closes.earliest)) {
      return "open";
    }
  }
  return window.status;
}

// The best news first: a program with any open window is open. "Closed" needs every window
// closed, so an unpublished newer window keeps the program "unknown" instead of "closed".
const PRECEDENCE: readonly WindowStatus[] = ["open", "upcoming", "unknown", "closed"];

export function programStatus(windows: readonly StatusWindow[], today: string): WindowStatus {
  const statuses = windows.map((window) => windowStatus(window, today));
  return PRECEDENCE.find((status) => statuses.includes(status)) ?? "unknown";
}
