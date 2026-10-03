import { z } from "zod";
import { ConfigError } from "./config";

// Only what a public page needs. The resume encryption key lives in loadConfig and is never
// read here, so a page that can't use it can't leak it.
const schema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(1),
});

export interface SupabaseConfig {
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
}

/** Throws a ConfigError naming the bad variables, never their values. */
export function loadSupabaseConfig(env: Readonly<Record<string, string | undefined>>): SupabaseConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new ConfigError(`Invalid environment. ${problems.join("; ")}`);
  }
  return { supabaseUrl: parsed.data.SUPABASE_URL, supabaseAnonKey: parsed.data.SUPABASE_ANON_KEY };
}
