import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileInput } from "../../features/profile/profile-input";
import type { Database } from "../db/database.types";
import { fromProfileRow, PROFILE_COLUMNS, toProfileRow } from "./profile-row";

/**
 * A profile read or write failed. Carries only the database's error code, never its message: that
 * message can name tables, columns and policies, and must not travel to a response or a log.
 */
export class ProfileStoreError extends Error {
  constructor(
    readonly action: "reading" | "saving",
    readonly code: string,
  ) {
    super(`${action} the profile failed (${code})`);
    this.name = "ProfileStoreError";
  }
}

// Postgres "insufficient privilege": the caller may not do this at all.
const INSUFFICIENT_PRIVILEGE = "42501";

/**
 * The signed-in student's own profile, or null if they have not saved one. Row-level security
 * limits the table to the caller's own row, so no id is passed and none can be forged. A caller
 * with no account is refused by the database outright, which here means there is nothing visible
 * to them: also null.
 */
export async function loadProfile(client: SupabaseClient<Database>): Promise<ProfileInput | null> {
  const { data, error } = await client.from("profiles").select(PROFILE_COLUMNS).maybeSingle();
  if (error !== null) {
    if (error.code === INSUFFICIENT_PRIVILEGE) {
      return null;
    }
    throw new ProfileStoreError("reading", error.code);
  }
  return data === null ? null : fromProfileRow(data);
}

/**
 * Save the student's whole profile, replacing what was there. The database refuses a row owned by
 * anyone but the caller, so naming another student's id fails rather than writing to theirs.
 */
export async function saveProfile(
  client: SupabaseClient<Database>,
  userId: string,
  input: ProfileInput,
): Promise<void> {
  const { error } = await client
    .from("profiles")
    .upsert(toProfileRow(userId, input), { onConflict: "user_id" });
  if (error !== null) {
    throw new ProfileStoreError("saving", error.code);
  }
}
