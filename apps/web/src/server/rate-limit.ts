import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./db/database.types";

/**
 * Checking a limit failed. Carries only the database's error code: its message can name the
 * function and its permissions, which must not travel to a response or a log.
 */
export class RateLimitError extends Error {
  constructor(readonly code: string) {
    super(`checking the rate limit failed (${code})`);
    this.name = "RateLimitError";
  }
}

/** The buckets the database knows. It refuses any other, so none can be made up from outside. */
export type RateLimitBucket = "upload" | "profile" | "feedback" | "log_event" | "tracker";

/**
 * Count one hit for the signed-in student in a named bucket, and say whether they are still within
 * `maxHits` (1 to 10000) per `windowLength` (a Postgres interval from "1 minute" to "1 day", such
 * as "1 hour"). The counting is done by the
 * database, per student and per bucket, so it holds across every server and every instance.
 *
 * A caller with no account has nobody to count against, so this throws for them instead of
 * allowing: a limit that quietly lets visitors through is no limit.
 */
export async function withinLimit(
  client: SupabaseClient<Database>,
  bucket: RateLimitBucket,
  maxHits: number,
  windowLength: string,
): Promise<boolean> {
  const { data, error } = await client.rpc("rate_limit_hit", {
    bucket,
    max_hits: maxHits,
    window_len: windowLength,
  });
  if (error !== null) {
    throw new RateLimitError(error.code);
  }
  return data === true;
}
