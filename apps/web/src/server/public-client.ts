import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadSupabaseConfig } from "../config/supabase-config";
import type { Database } from "./db/database.types";

/**
 * A client for public pages: the anonymous role with no session, so row-level security alone
 * decides what a visitor sees. It never holds the service-role key or any user's session.
 */
export function createPublicClient(
  env: Readonly<Record<string, string | undefined>> = process.env,
): SupabaseClient<Database> {
  const { supabaseUrl, supabaseAnonKey } = loadSupabaseConfig(env);
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
