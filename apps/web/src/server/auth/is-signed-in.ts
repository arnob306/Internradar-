import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../db/database.types";
import { logFailure } from "../log";

/**
 * Whether the auth server recognises this request's session. A lookup that fails counts as
 * "not signed in" and is recorded safely, so a page can always render, and never shows an
 * account's links on a guess.
 */
export async function isSignedIn(
  client: SupabaseClient<Database>,
  log: (scope: string, error: unknown) => void = logFailure,
): Promise<boolean> {
  try {
    return (await client.auth.getUser()).data.user !== null;
  } catch (error) {
    log("auth.is-signed-in", error);
    return false;
  }
}
