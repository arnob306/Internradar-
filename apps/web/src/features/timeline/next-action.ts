import type { ConfirmedEntry, UsualEntry } from "./build-timeline";
import type { TimelineEntry } from "./date-basis";
import { monthName } from "./month-names";

/** How long before an opening a student should start preparing (decision D22): four weeks. */
export const PREP_LEAD_DAYS = 28;

const NOT_ANNOUNCED = "Dates not announced. Check the employer's page.";

const pad = (value: number): string => String(value).padStart(2, "0");

/** The ISO date `days` before another. Plain calendar arithmetic, so no time zone is involved. */
function daysBefore(isoDate: string, days: number): string {
  const earlier = new Date(Date.UTC(Number(isoDate.slice(0, 4)), Number(isoDate.slice(5, 7)) - 1, Number(isoDate.slice(8, 10)) - days));
  return `${earlier.getUTCFullYear()}-${pad(earlier.getUTCMonth() + 1)}-${pad(earlier.getUTCDate())}`;
}

const shortMonth = (isoDate: string): string => `${monthName(Number(isoDate.slice(5, 7))).slice(0, 3)} ${isoDate.slice(0, 4)}`;
const shortDate = (isoDate: string): string => `${Number(isoDate.slice(8, 10))} ${shortMonth(isoDate)}`;

function whileOpen(entry: ConfirmedEntry): string {
  if (entry.closesOn !== null && entry.closesPrecision === "day") {
    return `Applications close ${shortDate(entry.closesOn)}. Apply before then.`;
  }
  if (entry.closesOn !== null && entry.closesPrecision === "month") {
    return `Applications close in ${shortMonth(entry.closesOn)}. Apply early.`;
  }
  return "No closing date listed. Apply soon.";
}

/** Preparation starts four weeks before the earliest day it could open. An estimated opening is not used. */
function beforeOpening(entry: ConfirmedEntry, today: string): string {
  if (entry.opensOn === null || (entry.opensPrecision !== "day" && entry.opensPrecision !== "month")) {
    return NOT_ANNOUNCED;
  }
  const earliest = entry.opensPrecision === "month" ? `${entry.opensOn.slice(0, 7)}-01` : entry.opensOn;
  const from = daysBefore(earliest, PREP_LEAD_DAYS);
  return from <= today ? "Opening soon. Start preparing now." : `Start preparing from ${shortDate(from)}.`;
}

/** A guess names only months, never a day: the month it usually opens and the month to start preparing. */
function whenUsual(entry: UsualEntry, today: string): string {
  const first = entry.occurrences[0];
  if (first === undefined) {
    return NOT_ANNOUNCED;
  }
  const from = daysBefore(`${first.year}-${pad(first.month)}-01`, PREP_LEAD_DAYS);
  const opens = `Usually opens around ${monthName(first.month)}.`;
  return from <= today ? `${opens} Start preparing now.` : `${opens} Start preparing around ${monthName(Number(from.slice(5, 7)))}.`;
}

/** One plain sentence on what to do about this program now. `today` is the Melbourne date. */
export function nextAction(entry: TimelineEntry, today: string): string {
  if (entry.kind === "usual") {
    return whenUsual(entry, today);
  }
  if (entry.kind === "none") {
    return NOT_ANNOUNCED;
  }
  return entry.windowStatus === "open" ? whileOpen(entry) : beforeOpening(entry, today);
}
