import type { ConfirmedEntry, NoDateEntry, UsualEntry } from "./build-timeline";

export type TimelineEntry = ConfirmedEntry | UsualEntry | NoDateEntry;

/** How sure a program's date is: the employer's own, a guess from past years, or nothing yet. */
export type DateBasis = "confirmed" | "estimated" | "not-announced";

export const DATE_BASIS_LABELS: Readonly<Record<DateBasis, string>> = {
  confirmed: "Confirmed",
  estimated: "Estimated",
  "not-announced": "Not announced",
};

/**
 * Being open now is a fact, so it is confirmed. Otherwise an opening counts only when the employer
 * stated it as a day or a month: an estimated date is a pattern, never a stated date (D19).
 */
export function dateBasis(entry: TimelineEntry): DateBasis {
  if (entry.kind === "usual") {
    return "estimated";
  }
  if (entry.kind === "none") {
    return "not-announced";
  }
  const stated = entry.opensOn !== null && (entry.opensPrecision === "day" || entry.opensPrecision === "month");
  return entry.windowStatus === "open" || stated ? "confirmed" : "not-announced";
}
