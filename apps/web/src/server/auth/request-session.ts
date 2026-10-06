import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "../db/database.types";
import { createSessionClient } from "./session-client";

/**
 * A client acting as whoever this request's cookies say it is, which can also write the session
 * cookies back on the response. Only for route handlers, where Next lets cookies be set.
 * All the behaviour lives in createSessionClient; this only hands it Next's cookie store.
 */
export async function sessionClientForRequest(): Promise<SupabaseClient<Database>> {
  const store = await cookies();
  return createSessionClient({
    getAll: () => store.getAll().map(({ name, value }) => ({ name, value })),
    set: (name, value, options) => {
      store.set(name, value, options);
    },
  });
}
