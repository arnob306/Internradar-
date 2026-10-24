import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../db/database.types";

/**
 * Signing out failed. Carries only the auth service's error code, never its message.
 */
export class SignOutError extends Error {
  constructor(readonly code: string) {
    super(`signing out failed (${code})`);
    this.name = "SignOutError";
  }
}

/**
 * End the session on this device only. The auth library's default scope is "global", which also
 * signs the same account out everywhere else: a student leaving a library computer would be signed
 * out of their phone too. "Local" is what a sign-out button means to a student.
 */
export async function signOutThisDevice(client: SupabaseClient<Database>): Promise<void> {
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error !== null) {
    throw new SignOutError(error.code ?? "unknown");
  }
}
