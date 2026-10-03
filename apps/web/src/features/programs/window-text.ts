import type { WindowStatus } from "../../components/StatusChip";
import { headlineWindow } from "./headline-window";

type Precision = "day" | "month" | "estimated" | null;

/** The parts of an application window that decide how it is worded. */
export interface TextWindow {
  readonly status: WindowStatus;
  readonly opensOn: string | null;
  readonly opensPrecision: Precision;
  readonly closesOn: string | null;
  readonly closesPrecision: Precision;
}

export interface WindowDescription {
  readonly text: string;
  /** True when the wording is a guess from a pattern, so the card can say so. */
  readonly estimated: boolean;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthName(isoDate: string): string {
  return MONTHS[Number(isoDate.slice(5, 7)) - 1] ?? "";
}

/** A date worded exactly as precisely as it is known; null if it is only an estimate. */
function stated(isoDate: string | null, precision: Precision): string | null {
  if (isoDate === null) {
    return null;
  }
  const year = isoDate.slice(0, 4);
  if (precision === "day") {
    return `${Number(isoDate.slice(8, 10))} ${monthName(isoDate)} ${year}`;
  }
  if (precision === "month") {
    return `${monthName(isoDate)} ${year}`;
  }
  return null;
}

function withoutDates(status: WindowStatus): WindowDescription {
  const text =
    status === "open"
      ? "Open now. No closing date listed."
      : status === "closed"
        ? "This round has closed."
        : "No dates on the employer's page yet.";
  return { text, estimated: false };
}

function describeOne(window: TextWindow, status: WindowStatus): WindowDescription {
  const opens = stated(window.opensOn, window.opensPrecision);
  const closes = stated(window.closesOn, window.closesPrecision);

  if (opens !== null && closes !== null) {
    return { text: opens === closes ? opens : `${opens} to ${closes}`, estimated: false };
  }
  if (opens !== null) {
    return { text: `Opens ${window.opensPrecision === "month" ? "in " : ""}${opens}`, estimated: false };
  }
  if (closes !== null) {
    return { text: `Closes ${window.closesPrecision === "month" ? "in " : ""}${closes}`, estimated: false };
  }

  // Nothing is stated, so all that is left is a pattern, and it is labelled as one.
  const opensGuess =
    window.opensPrecision === "estimated" && window.opensOn !== null ? monthName(window.opensOn) : null;
  const closesGuess =
    window.closesPrecision === "estimated" && window.closesOn !== null ? monthName(window.closesOn) : null;
  if (opensGuess !== null && closesGuess !== null) {
    const span = opensGuess === closesGuess ? opensGuess : `${opensGuess} to ${closesGuess}`;
    return { text: `Usually ${span}`, estimated: true };
  }
  if (opensGuess !== null) {
    return { text: `Usually opens in ${opensGuess}`, estimated: true };
  }
  if (closesGuess !== null) {
    return { text: `Usually closes in ${closesGuess}`, estimated: true };
  }
  return withoutDates(status);
}

/**
 * Plain words for a program's application window. Windows come newest first; the first one that
 * has not closed is the one a student cares about, else the newest.
 */
export function describeWindows(
  windows: readonly TextWindow[],
  status: WindowStatus,
): WindowDescription {
  const headline = headlineWindow(windows);
  return headline === undefined ? withoutDates(status) : describeOne(headline, status);
}
