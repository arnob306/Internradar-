import type { PublicProgram } from "../../server/programs/programs-handler";
import { daysBefore, PREP_LEAD_DAYS } from "../timeline/next-action";
import { melbourneDate } from "./melbourne-date";

/** What a calendar file needs from a program: its name, who runs it, and its windows. */
export type CalendarProgram = Pick<PublicProgram, "id" | "name" | "windows"> & {
  readonly company: { readonly name: string };
};

type CalendarWindow = CalendarProgram["windows"][number];

interface CalendarEvent {
  readonly uid: string;
  readonly date: string;
  readonly summary: string;
  readonly description: string;
}

const MAX_LINE_OCTETS = 75;
const encoder = new TextEncoder();

const compact = (isoDate: string): string => isoDate.replaceAll("-", "");
const pad = (n: number): string => String(n).padStart(2, "0");

/** Text values: backslash, semicolon, comma and line breaks all have a meaning in a calendar file. */
function escapeText(text: string): string {
  return text.replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

/** Lines may not pass 75 octets: the rest continues on the next line after one space. */
function fold(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const character of line) {
    const width = encoder.encode(character).length;
    if (size + width > MAX_LINE_OCTETS) {
      out.push(current);
      current = ` ${character}`;
      size = 1 + width;
    } else {
      current += character;
      size += width;
    }
  }
  out.push(current);
  return out;
}

function stamp(instant: Date): string {
  const date = `${instant.getUTCFullYear()}${pad(instant.getUTCMonth() + 1)}${pad(instant.getUTCDate())}`;
  return `${date}T${pad(instant.getUTCHours())}${pad(instant.getUTCMinutes())}${pad(instant.getUTCSeconds())}Z`;
}

type EventKind = "prepare" | "opens" | "closes";

const SUMMARY_ENDING: Record<EventKind, string> = {
  prepare: "start preparing",
  opens: "applications open",
  closes: "applications close",
};

/**
 * A date the source proves to the day, and that has not passed. Month-only and estimated dates are
 * not events. The preparing day is the proven opening day minus the 4-week lead (D22).
 */
function eventFor(
  program: CalendarProgram,
  window: CalendarWindow,
  kind: EventKind,
  today: string,
): CalendarEvent | null {
  const proven = kind === "closes" ? window.closesOn : window.opensOn;
  const precision = kind === "closes" ? window.closesPrecision : window.opensPrecision;
  if (proven === null || precision !== "day") {
    return null;
  }
  const date = kind === "prepare" ? daysBefore(proven, PREP_LEAD_DAYS) : proven;
  if (date < today) {
    return null;
  }
  return {
    uid: `${program.id}-${window.cycleYear}-${window.windowSeq}-${kind}@internradar`,
    date,
    summary: `${program.name}: ${SUMMARY_ENDING[kind]}`,
    description: `Dates can change. Confirm on the employer's page before you plan around this date.\nSource: ${window.sourceUrl}`,
  };
}

function eventLines(event: CalendarEvent, stampedAt: string): string[] {
  return [
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${stampedAt}`,
    `DTSTART;VALUE=DATE:${compact(event.date)}`,
    `DTEND;VALUE=DATE:${compact(daysBefore(event.date, -1))}`,
    `SUMMARY:${escapeText(event.summary)}`,
    `DESCRIPTION:${escapeText(event.description)}`,
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
  ];
}

/**
 * A calendar file (iCalendar) with one all-day event for each opening or closing date that the
 * employer's source gives to the day and that has not passed. Returns null when there is none.
 */
export function buildCalendar(program: CalendarProgram, now: Date): string | null {
  const today = melbourneDate(now);
  const events = program.windows.flatMap((window) =>
    (["prepare", "opens", "closes"] as const).flatMap((kind) => eventFor(program, window, kind, today) ?? []),
  );
  if (events.length === 0) {
    return null;
  }
  const stampedAt = stamp(now);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//InternRadar//Application dates//EN",
    "CALSCALE:GREGORIAN",
    ...events.flatMap((event) => eventLines(event, stampedAt)),
    "END:VCALENDAR",
  ];
  return `${lines.flatMap(fold).join("\r\n")}\r\n`;
}
