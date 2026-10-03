import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";
import { inject } from "vitest";
import type { Database } from "../../src/server/db/database.types";

/** Test companies carry this prefix, so cleanup removes only what the tests created. */
export const TEST_PREFIX = "dbtest-";

const ADMIN_URL =
  process.env["INTERNRADAR_TEST_ADMIN_DB_URL"] ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

/** A client exactly as a visitor's browser would have: the anonymous role, no session. */
export function anonClient(): SupabaseClient<Database> {
  return createClient<Database>(inject("supabaseUrl"), inject("supabaseAnonKey"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** An admin connection for setup and cleanup only. Refuses anything but a local database. */
export async function withAdmin<T>(work: (db: pg.Client) => Promise<T>): Promise<T> {
  const host = new URL(ADMIN_URL).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`refusing to run DB tests against a non-local database host: ${host}`);
  }
  const db = new pg.Client({ connectionString: ADMIN_URL });
  await db.connect();
  try {
    return await work(db);
  } finally {
    await db.end();
  }
}

export async function cleanTestData(db: pg.Client): Promise<void> {
  // programs.company_id is ON DELETE RESTRICT, so programs go first; their windows cascade.
  await db.query(
    "delete from public.programs where company_id in (select id from public.companies where slug like $1)",
    [`${TEST_PREFIX}%`],
  );
  await db.query("delete from public.companies where slug like $1", [`${TEST_PREFIX}%`]);
}

export interface TestWindow {
  readonly cycleYear?: number;
  readonly windowSeq?: number;
  readonly opensOn?: string;
  readonly opensPrecision?: "day" | "month" | "estimated";
  readonly closesOn?: string;
  readonly closesPrecision?: "day" | "month" | "estimated";
  readonly programStartsOn?: string;
  readonly programEndsOn?: string;
  readonly status?: "upcoming" | "open" | "closed" | "unknown";
}

export interface TestProgram {
  readonly company: string;
  readonly companyName?: string;
  readonly slug?: string;
  readonly name: string;
  readonly type?: "internship" | "vacationer" | "graduate" | "cadetship" | "discovery";
  readonly disciplines?: readonly string[];
  readonly published?: boolean;
  readonly windows?: readonly TestWindow[];
}

/** Insert a test program (and its company and windows). Published unless said otherwise. */
export async function insertProgram(db: pg.Client, program: TestProgram): Promise<string> {
  const slug = `${TEST_PREFIX}${program.company}`;
  const company = await db.query<{ id: string }>(
    `insert into public.companies (slug, name, careers_url) values ($1, $2, $3)
     on conflict (slug) do update set name = excluded.name returning id`,
    [slug, program.companyName ?? program.company.toUpperCase(), `https://careers.${program.company}.example`],
  );
  const inserted = await db.query<{ id: string }>(
    `insert into public.programs
       (company_id, slug, name, program_type, cities, disciplines, source_url, is_published)
     values ($1, $2, $3, $4, '{melbourne}', $5, $6, $7) returning id`,
    [
      company.rows[0]?.id,
      program.slug ?? "program",
      program.name,
      program.type ?? "cadetship",
      program.disciplines ?? [],
      `https://careers.${program.company}.example/program`,
      program.published ?? true,
    ],
  );
  const programId = inserted.rows[0]?.id ?? "";
  for (const [index, window] of (program.windows ?? []).entries()) {
    await db.query(
      `insert into public.program_windows
         (program_id, cycle_year, window_seq, opens_on, opens_precision, closes_on,
          closes_precision, status, provenance, source_url, program_starts_on, program_ends_on)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'seed', $9, $10, $11)`,
      [
        programId,
        window.cycleYear ?? 2027,
        window.windowSeq ?? index + 1,
        window.opensOn ?? null,
        window.opensOn === undefined ? null : (window.opensPrecision ?? "day"),
        window.closesOn ?? null,
        window.closesOn === undefined ? null : (window.closesPrecision ?? "day"),
        window.status ?? "unknown",
        `https://careers.${program.company}.example/window`,
        window.programStartsOn ?? null,
        window.programEndsOn ?? null,
      ],
    );
  }
  return programId;
}
