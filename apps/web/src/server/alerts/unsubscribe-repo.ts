import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../db/database.types";

/**
 * Stopping alert emails failed. Carries only the database's error code, never its message: that
 * message can name the function and its permissions, and must not travel to a response or a log.
 */
export class AlertStoreError extends Error {
  constructor(readonly code: string) {
    super(`stopping alert emails failed (${code})`);
    this.name = "AlertStoreError";
  }
}

/**
 * Turn off alert emails for the owner of this alert. Callable by a visitor who is not signed in:
 * the database function is the only thing opened to them, it changes one column, and it gives the
 * same answer whether or not the alert exists.
 */
export async function unsubscribeFromAlert(client: SupabaseClient<Database>, alertId: string): Promise<void> {
  const { error } = await client.rpc("unsubscribe_from_alert", { alert_id: alertId });
  if (error !== null) {
    throw new AlertStoreError(error.code);
  }
}
