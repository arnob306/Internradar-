import type { ApplicationStatus, StatusChange } from "@internradar/domain";
import type { SupabaseClient } from "@supabase/supabase-js";
import { headlineWindow } from "../../features/programs/headline-window";
import type { Database } from "../db/database.types";
import { getProgramById } from "../programs/list-programs";
import type { ApplicationChange, ApplicationRecord } from "./applications-handler";

/**
 * A tracker read or write failed. Carries only the database's error code, never its message: that
 * message can name tables, columns, policies and the rule that was broken, and must not travel to a
 * response or a log.
 */
export class ApplicationStoreError extends Error {
  constructor(
    readonly action: "reading" | "saving" | "updating" | "removing",
    readonly code: string,
  ) {
    super(`${action} an application failed (${code})`);
    this.name = "ApplicationStoreError";
  }
}

// Explicit columns, never `select *`: only what the tracker shows is ever read.
const COLUMNS = `
  id, program_id, cycle_year, status, applied_at, notes, resume_id, updated_at,
  programs!inner ( slug, name, companies!inner ( slug, name ) )
`;

// Postgres "unique violation": the student already has this program for this intake.
const UNIQUE_VIOLATION = "23505";

type Client = SupabaseClient<Database>;

interface Row {
  readonly id: string;
  readonly program_id: string;
  readonly cycle_year: number;
  readonly status: ApplicationStatus;
  readonly applied_at: string | null;
  readonly notes: string | null;
  readonly resume_id: string | null;
  readonly updated_at: string;
  readonly programs: {
    readonly slug: string;
    readonly name: string;
    readonly companies: { readonly slug: string; readonly name: string };
  };
}

function toRecord(row: Row): ApplicationRecord {
  return {
    id: row.id,
    programId: row.program_id,
    programSlug: row.programs.slug,
    programName: row.programs.name,
    companySlug: row.programs.companies.slug,
    companyName: row.programs.companies.name,
    cycleYear: row.cycle_year,
    status: row.status,
    appliedAt: row.applied_at,
    notes: row.notes,
    resumeId: row.resume_id,
    updatedAt: row.updated_at,
  };
}

/** The student's applications, newest change first. Row-level security limits them to their own. */
export async function listApplications(client: Client): Promise<ApplicationRecord[]> {
  const { data, error } = await client.from("applications").select(COLUMNS).order("updated_at", { ascending: false });
  if (error !== null) {
    throw new ApplicationStoreError("reading", error.code);
  }
  return data.map(toRecord);
}

/** Whether the student already has this program in their tracker. Row-level security limits it to their own. */
export async function hasApplicationFor(client: Client, programId: string): Promise<boolean> {
  const { data, error } = await client.from("applications").select("id").eq("program_id", programId).limit(1);
  if (error !== null) {
    throw new ApplicationStoreError("reading", error.code);
  }
  return data.length > 0;
}

/** One of the student's own applications, or null: someone else's looks exactly like a missing one. */
export async function findApplication(client: Client, id: string): Promise<ApplicationRecord | null> {
  const { data, error } = await client.from("applications").select(COLUMNS).eq("id", id).maybeSingle();
  if (error !== null) {
    throw new ApplicationStoreError("reading", error.code);
  }
  return data === null ? null : toRecord(data);
}

/**
 * Save a program for the student as `saved`, for the intake that is coming (the program's newest
 * window that has not closed), or for this year if it has no window yet. Saving the same program
 * again returns what they already have. Null when the program does not exist or is not published.
 * The database refuses a row for anyone but the signed-in student, whatever `userId` says.
 */
export async function saveApplication(
  client: Client,
  userId: string,
  programId: string,
  today: string,
): Promise<{ record: ApplicationRecord; created: boolean } | null> {
  const program = await getProgramById(client, programId, today);
  if (program === null) {
    return null;
  }
  const window = headlineWindow(program.windows);
  const cycleYear = window?.cycleYear ?? Number(today.slice(0, 4));

  let windowId: string | null = null;
  if (window !== undefined) {
    const { data, error } = await client
      .from("program_windows")
      .select("id")
      .eq("program_id", program.id)
      .eq("cycle_year", window.cycleYear)
      .eq("window_seq", window.windowSeq)
      .maybeSingle();
    if (error !== null) {
      throw new ApplicationStoreError("reading", error.code);
    }
    windowId = data?.id ?? null;
  }

  const inserted = await client
    .from("applications")
    .insert({ user_id: userId, program_id: program.id, program_window_id: windowId, cycle_year: cycleYear })
    .select(COLUMNS)
    .single();
  if (inserted.error === null) {
    return { record: toRecord(inserted.data), created: true };
  }
  if (inserted.error.code !== UNIQUE_VIOLATION) {
    throw new ApplicationStoreError("saving", inserted.error.code);
  }

  const existing = await client
    .from("applications")
    .select(COLUMNS)
    .eq("program_id", program.id)
    .eq("cycle_year", cycleYear)
    .maybeSingle();
  if (existing.error !== null || existing.data === null) {
    throw new ApplicationStoreError("saving", existing.error?.code ?? UNIQUE_VIOLATION);
  }
  return { record: toRecord(existing.data), created: false };
}

/** The most recent status change of an application, or null if there is none or it is not theirs. */
export async function latestChange(client: Client, id: string): Promise<StatusChange | null> {
  const { data, error } = await client
    .from("application_events")
    .select("from_status, to_status, is_undo")
    .eq("application_id", id)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error !== null) {
    throw new ApplicationStoreError("reading", error.code);
  }
  return data === null ? null : { fromStatus: data.from_status, toStatus: data.to_status, isUndo: data.is_undo };
}

/**
 * Apply a change only while the application still has the status the student saw, and return it;
 * null when it has moved on, is gone, or is not theirs. The database also refuses any status move
 * that is not forward (or the single undo), so this cannot be used to skip the rules.
 */
export async function updateApplication(
  client: Client,
  id: string,
  change: ApplicationChange,
  expectedStatus: ApplicationStatus,
): Promise<ApplicationRecord | null> {
  const { data, error } = await client
    .from("applications")
    .update({
      ...(change.status === undefined ? {} : { status: change.status }),
      ...(change.appliedAt === undefined ? {} : { applied_at: change.appliedAt }),
      ...(change.notes === undefined ? {} : { notes: change.notes }),
      ...(change.resumeId === undefined ? {} : { resume_id: change.resumeId }),
    })
    .eq("id", id)
    .eq("status", expectedStatus)
    .select(COLUMNS)
    .maybeSingle();
  if (error !== null) {
    throw new ApplicationStoreError("updating", error.code);
  }
  return data === null ? null : toRecord(data);
}

/** Remove one of the student's applications and its history. False if there was nothing to remove. */
export async function removeApplication(client: Client, id: string): Promise<boolean> {
  const { data, error } = await client.from("applications").delete().eq("id", id).select("id");
  if (error !== null) {
    throw new ApplicationStoreError("removing", error.code);
  }
  return data.length > 0;
}
