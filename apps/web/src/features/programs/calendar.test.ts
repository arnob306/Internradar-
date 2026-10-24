import { describe, expect, it } from "vitest";
import { buildCalendar } from "./calendar";

type Program = Parameters<typeof buildCalendar>[0];
type Window = Program["windows"][number];

// 13:00 on 3 October 2026 in Melbourne (UTC+10; daylight saving starts at 2am on the 4th).
const NOW = new Date("2026-10-03T03:00:00Z");

function window(overrides: Partial<Window> = {}): Window {
  return {
    cycleYear: 2027,
    windowSeq: 1,
    opensOn: "2026-11-15",
    opensPrecision: "day",
    closesOn: "2026-12-31",
    closesPrecision: "day",
    programStartsOn: null,
    programEndsOn: null,
    status: "upcoming",
    sourceUrl: "https://careers.example.com.au/graduates",
    ...overrides,
  };
}

function program(windows: Window[], name = "Example Graduate Program"): Program {
  return { id: "7f0e6a3e-0000-4000-8000-000000000001", name, company: { name: "Example Co" }, windows };
}

const lines = (calendar: string | null): string[] => (calendar ?? "").split("\r\n");
const eventCount = (calendar: string | null): number => (calendar ?? "").match(/BEGIN:VEVENT/g)?.length ?? 0;

describe("buildCalendar", () => {
  it("makes an all-day event for the day applications open and the day they close", () => {
    const calendar = buildCalendar(program([window()]), NOW);

    expect(calendar).not.toBeNull();
    expect(lines(calendar)).toEqual(expect.arrayContaining(["BEGIN:VCALENDAR", "VERSION:2.0", "END:VCALENDAR"]));
    expect(eventCount(calendar)).toBe(2);
    expect(lines(calendar)).toEqual(
      expect.arrayContaining([
        "DTSTART;VALUE=DATE:20261115",
        "DTEND;VALUE=DATE:20261116",
        "SUMMARY:Example Graduate Program: applications open",
        "DTSTART;VALUE=DATE:20261231",
        "DTEND;VALUE=DATE:20270101",
        "SUMMARY:Example Graduate Program: applications close",
      ]),
    );
  });

  it("separates lines with CRLF, as the calendar format requires", () => {
    const calendar = buildCalendar(program([window()]), NOW) ?? "";

    expect(calendar.endsWith("\r\n")).toBe(true);
    expect(calendar.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("leaves out a date that is only known to the month or estimated, so it is never shown more precisely than its source", () => {
    const monthOnly = window({ opensPrecision: "month", closesPrecision: "estimated" });
    const dayOpenOnly = window({ closesPrecision: "month" });

    expect(buildCalendar(program([monthOnly]), NOW)).toBeNull();
    const calendar = buildCalendar(program([dayOpenOnly]), NOW);
    expect(eventCount(calendar)).toBe(1);
    expect(calendar).toContain("applications open");
    expect(calendar).not.toContain("applications close");
  });

  it("leaves out dates that have passed, judged by the Melbourne day, and keeps today", () => {
    const closesToday = window({ opensOn: "2026-10-02", closesOn: "2026-10-03" });

    const kept = buildCalendar(program([closesToday]), new Date("2026-10-03T13:59:00Z"));
    expect(eventCount(kept)).toBe(1);
    expect(kept).toContain("DTSTART;VALUE=DATE:20261003");
    // One minute later it is 4 October in Melbourne, so a 3 October date has passed.
    expect(buildCalendar(program([closesToday]), new Date("2026-10-03T14:00:00Z"))).toBeNull();
  });

  it("returns nothing when there is no date to put in a calendar", () => {
    const undated = window({ opensOn: null, opensPrecision: null, closesOn: null, closesPrecision: null });

    expect(buildCalendar(program([]), NOW)).toBeNull();
    expect(buildCalendar(program([undated]), NOW)).toBeNull();
  });

  it("tells the student to confirm on the employer's page, and links to the source", () => {
    const unfolded = (buildCalendar(program([window()]), NOW) ?? "").replace(/\r\n /g, "");

    expect(unfolded).toContain("Dates can change. Confirm on the employer's page");
    expect(unfolded).toContain("https://careers.example.com.au/graduates");
  });

  it("escapes characters that mean something in a calendar, and folds long lines", () => {
    const awkward = "Graduate, Intern; and \\ more\nprograms " + "x".repeat(120);
    const calendar = buildCalendar(program([window()], awkward), NOW) ?? "";
    const unfolded = calendar.replace(/\r\n /g, "");

    expect(unfolded).toContain("Graduate\\, Intern\\; and \\\\ more\\nprograms");
    for (const line of lines(calendar)) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(unfolded).toContain("x".repeat(120));
  });

  it("gives each event a stable, different id, so importing it again updates it instead of copying it", () => {
    const first = buildCalendar(program([window()]), NOW);
    const later = buildCalendar(program([window()]), new Date("2026-10-05T00:00:00Z"));
    const uids = (first ?? "").match(/UID:.+/g) ?? [];

    expect(uids).toHaveLength(2);
    expect(new Set(uids).size).toBe(2);
    expect(later?.match(/UID:.+/g)).toEqual(uids);
  });
});
