import type { ProgramType } from "@internradar/domain";
import type { QueryData, SupabaseClient } from "@supabase/supabase-js";
import type { WindowStatus } from "../../components/StatusChip";
import type { ProgramsQuery } from "../../features/programs/programs-query";
import { programStatus, type StatusWindow } from "../../features/programs/window-status";
import type { Database, Json } from "../db/database.types";

export interface ProgramWindowItem {
  readonly cycleYear: number;
  readonly windowSeq: number;
  readonly opensOn: string | null;
  readonly opensPrecision: "day" | "month" | "estimated" | null;
  readonly closesOn: string | null;
  readonly closesPrecision: "day" | "month" | "estimated" | null;
  /** The program's own dates, which year level is judged against. Null when not published. */
  readonly programStartsOn: string | null;
  readonly programEndsOn: string | null;
  readonly status: WindowStatus;
  readonly sourceUrl: string;
}

export interface ProgramListItem {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly programType: ProgramType;
  readonly cities: readonly string[];
  readonly disciplines: readonly string[];
  readonly sourceUrl: string;
  readonly company: { readonly slug: string; readonly name: string; readonly careersUrl: string };
  /** Whether applications are open, derived from the windows' dates as far as they prove it. */
  readonly status: WindowStatus;
  readonly windows: readonly ProgramWindowItem[];
  readonly eligibilityRules: Json;
  /** False until a person has checked the rules, so the engine answers "check requirements". */
  readonly rulesVerified: boolean;
  /** Which revision of the rules this is, so a result can say what it was judged against. */
  readonly rulesVersion: number;
}

export interface ProgramsPage {
  readonly items: readonly ProgramListItem[];
  readonly total: number;
}

// Explicit columns, never `select *`: only what the feed needs is ever read.
const COLUMNS = `
  id, slug, name, program_type, cities, disciplines, source_url,
  eligibility_rules, eligibility_rules_version, eligibility_verified_at,
  companies!inner ( slug, name, careers_url ),
  program_windows ( cycle_year, window_seq, opens_on, opens_precision, closes_on,
                    closes_precision, program_starts_on, program_ends_on, status, source_url )
`;

// Far more than the catalog will hold for a long while; the page itself is cut in memory.
const FETCH_LIMIT = 1000;

// Names sort the way a person reads them ("Program 2" before "Program 10"), in one fixed locale so
// the order never depends on which server renders the page.
const NAMES = new Intl.Collator("en-AU", { numeric: true, sensitivity: "base" });

const STATUS_ORDER: Readonly<Record<WindowStatus, number>> = {
  open: 0,
  upcoming: 1,
  unknown: 2,
  closed: 3,
};

/** One database row as the repository reads it (explicit columns, with the company and windows). */
type ProgramRow = QueryData<ReturnType<typeof programsQuery>>[number];

function programsQuery(client: SupabaseClient<Database>) {
  return client.from("programs").select(COLUMNS);
}

/** Map one row to the shape the pages use, deriving its status from its windows' dates. */
function toListItem(row: ProgramRow, today: string): ProgramListItem {
  const windows: ProgramWindowItem[] = row.program_windows
    .map((window) => ({
      cycleYear: window.cycle_year,
      windowSeq: window.window_seq,
      opensOn: window.opens_on,
      opensPrecision: window.opens_precision,
      closesOn: window.closes_on,
      closesPrecision: window.closes_precision,
      programStartsOn: window.program_starts_on,
      programEndsOn: window.program_ends_on,
      status: window.status,
      sourceUrl: window.source_url,
    }))
    .sort((a, b) => b.cycleYear - a.cycleYear || a.windowSeq - b.windowSeq);
  const statusWindows: StatusWindow[] = windows.map((window) => ({
    status: window.status,
    opens_on: window.opensOn,
    opens_precision: window.opensPrecision,
    closes_on: window.closesOn,
    closes_precision: window.closesPrecision,
  }));
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    programType: row.program_type,
    cities: row.cities,
    disciplines: row.disciplines,
    sourceUrl: row.source_url,
    company: {
      slug: row.companies.slug,
      name: row.companies.name,
      careersUrl: row.companies.careers_url,
    },
    status: programStatus(statusWindows, today),
    windows,
    eligibilityRules: row.eligibility_rules,
    rulesVerified: row.eligibility_verified_at !== null,
    rulesVersion: row.eligibility_rules_version,
  };
}

/**
 * The published programs matching the query, as the caller's role is allowed to see them. Row-
 * level security hides unpublished programs; this never filters them itself, so it cannot leak
 * one by mistake. `today` is a Melbourne date, injected so "open now" is testable.
 *
 * At this product's size (about a hundred programs) the statuses are derived and the page is
 * cut in memory, which keeps "open now" correct with an injected date. If the catalog ever
 * outgrows that, this is the one function to move into SQL.
 */
export async function listPrograms(
  client: SupabaseClient<Database>,
  query: ProgramsQuery,
  today: string,
): Promise<ProgramsPage> {
  let request = programsQuery(client).limit(FETCH_LIMIT);
  if (query.type !== undefined) {
    request = request.eq("program_type", query.type);
  }
  if (query.discipline !== undefined) {
    request = request.contains("disciplines", [query.discipline]);
  }

  const { data, error } = await request;
  if (error !== null) {
    // The message can name tables and columns; keep it out of anything shown to a visitor.
    throw new Error(`listing programs failed (${error.code})`);
  }

  const items = data
    .map((row) => toListItem(row, today))
    .filter((item) => !query.openNow || item.status === "open")
    .sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        NAMES.compare(a.company.name, b.company.name) ||
        NAMES.compare(a.name, b.name),
    );

  return { items: items.slice(query.offset, query.offset + query.limit), total: items.length };
}

/**
 * One published program by its employer's slug and its own slug, or null if there is none. A
 * program's slug is only unique within its employer (every employer has a "graduate-program"), so
 * both are needed. Row-level security hides unpublished programs, so they are null here too, and
 * a visitor cannot tell a draft from a program that does not exist.
 */
export async function getProgram(
  client: SupabaseClient<Database>,
  companySlug: string,
  programSlug: string,
  today: string,
): Promise<ProgramListItem | null> {
  const { data, error } = await programsQuery(client)
    .eq("slug", programSlug)
    .eq("companies.slug", companySlug)
    .maybeSingle();
  if (error !== null) {
    throw new Error(`fetching a program failed (${error.code})`);
  }
  return data === null ? null : toListItem(data, today);
}
