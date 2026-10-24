import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../db/database.types";

/**
 * A follow read or write failed. Carries only the database's error code, never its message: that
 * message can name tables, columns and policies, and must not travel to a response or a log.
 */
export class FollowStoreError extends Error {
  constructor(
    readonly action: "reading" | "following" | "unfollowing",
    readonly code: string,
  ) {
    super(`${action} a program failed (${code})`);
    this.name = "FollowStoreError";
  }
}

type Client = SupabaseClient<Database>;

/**
 * Follow a program as the signed-in student. False when the program does not exist or is not
 * published (row-level security hides it), and then nothing is written. Following again changes
 * nothing. The database refuses a row for anyone but the signed-in student, whatever `userId` says.
 */
export async function followProgram(client: Client, userId: string, programId: string): Promise<boolean> {
  const visible = await client.from("programs").select("id").eq("id", programId).maybeSingle();
  if (visible.error !== null) {
    throw new FollowStoreError("reading", visible.error.code);
  }
  if (visible.data === null) {
    return false;
  }
  const { error } = await client
    .from("program_follows")
    .upsert({ user_id: userId, program_id: programId }, { onConflict: "user_id,program_id", ignoreDuplicates: true });
  if (error !== null) {
    throw new FollowStoreError("following", error.code);
  }
  return true;
}

/** Stop following. Only the signed-in student's own follow is ever visible, so no one else's is removed. */
export async function unfollowProgram(client: Client, userId: string, programId: string): Promise<void> {
  const { error } = await client.from("program_follows").delete().eq("user_id", userId).eq("program_id", programId);
  if (error !== null) {
    throw new FollowStoreError("unfollowing", error.code);
  }
}

/** Whether the signed-in student follows the program. Someone else's follow is invisible to them. */
export async function isFollowing(client: Client, programId: string): Promise<boolean> {
  const { data, error } = await client.from("program_follows").select("program_id").eq("program_id", programId).limit(1);
  if (error !== null) {
    throw new FollowStoreError("reading", error.code);
  }
  return data.length > 0;
}
