import { z } from "zod";
import { Secret } from "./secret";

/**
 * Canonical base64 for exactly 32 bytes: 42 free characters, then a final
 * character whose 2 unused low bits are zero (A E I M Q U Y c g k o s w 0 4 8),
 * then one '=' pad.
 */
const BASE64_32_BYTES = /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/;

const envSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  RESUME_KEK_V1: z
    .string()
    .regex(BASE64_32_BYTES, "must be base64 encoding of exactly 32 bytes"),
});

export interface WebConfig {
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  readonly resumeKek: Secret;
}

/** Thrown when the environment is invalid. Names variables, never values. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function loadConfig(env: Readonly<Record<string, string | undefined>>): WebConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`,
    );
    throw new ConfigError(`Invalid environment. ${problems.join("; ")}`);
  }
  return {
    supabaseUrl: parsed.data.SUPABASE_URL,
    supabaseAnonKey: parsed.data.SUPABASE_ANON_KEY,
    resumeKek: new Secret(parsed.data.RESUME_KEK_V1),
  };
}
