import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSupabaseConfig } from "../../config/supabase-config";
import type { Database } from "../db/database.types";
import { hardenCookie } from "./cookie-options";

/** The request's cookies in, the response's cookies out. Next's cookie store fits this shape. */
export interface CookieJar {
  getAll(): { name: string; value: string }[];
  set(name: string, value: string, options: CookieOptions): void;
}

export interface SessionClientOptions {
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Whether cookies are marked Secure. Defaults to true in a production build. */
  readonly production?: boolean;
  /**
   * Receives the cache headers the auth library says must go on any response that sets a session
   * cookie, so a CDN can never cache one person's session and serve it to another.
   */
  readonly onHeaders?: (headers: Record<string, string>) => void;
}

/**
 * A Supabase client acting as whoever the request's cookies say it is, or as an anonymous visitor
 * if there are none or they do not check out. Row-level security then decides what it can see:
 * this is the signed-in counterpart of createPublicClient, and like it never holds the
 * service-role key.
 */
export function createSessionClient(
  jar: CookieJar,
  options: SessionClientOptions = {},
): SupabaseClient<Database> {
  const { env = process.env, production = process.env["NODE_ENV"] === "production", onHeaders } = options;
  const { supabaseUrl, supabaseAnonKey } = loadSupabaseConfig(env);

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (cookies, headers) => {
        for (const { name, value, options: cookieOptions } of cookies) {
          try {
            jar.set(name, value, hardenCookie(cookieOptions, production));
          } catch {
            // A server component is not allowed to set cookies, and Next throws when it tries.
            // That is expected there: the proxy refreshes sessions and does the writing. Route
            // handlers, where sign-in happens, can write, and do.
          }
        }
        onHeaders?.(headers);
      },
    },
  });
}
