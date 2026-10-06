import type { CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** One cookie the auth library wants written. A large session arrives as several of these. */
export interface PendingCookie {
  readonly name: string;
  readonly value: string;
  readonly options: CookieOptions;
}

/**
 * The response for a request whose session may just have been refreshed. Every refreshed cookie
 * goes on the response, and on the request too so the rest of this same request sees the new
 * session, and the library's no-cache headers go on as well. Build the response once, here, after
 * all the cookies are known: making a fresh response per cookie keeps only the last one, which
 * leaves a student with half a session after the hourly refresh.
 *
 * Pass `base` to carry the same cookies onto a different response, such as a redirect.
 */
export function respondWithSession(
  request: NextRequest,
  cookies: readonly PendingCookie[],
  headers: Readonly<Record<string, string>>,
  base?: NextResponse,
): NextResponse {
  for (const { name, value } of cookies) {
    request.cookies.set(name, value);
  }
  const response = base ?? NextResponse.next({ request });
  for (const { name, value, options } of cookies) {
    response.cookies.set(name, value, options);
  }
  for (const [name, value] of Object.entries(headers)) {
    response.headers.set(name, value);
  }
  return response;
}
