import { NextResponse, type NextRequest } from "next/server";
import { loginRedirectFor } from "./features/auth/protected-paths";
import { createSessionClient } from "./server/auth/session-client";
import { respondWithSession, type PendingCookie } from "./server/auth/session-response";

/**
 * Runs before every page. It keeps a signed-in student's session fresh (access tokens last an
 * hour, and only a place that can set cookies can renew one) and sends visitors away from pages
 * that need an account. The rules live in tested modules; this only connects them.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  // Collected while the auth library works, then written once. A session can be split over several
  // cookies, so the response is built after the last one is known (see respondWithSession).
  const refreshed: PendingCookie[] = [];
  let headers: Record<string, string> = {};

  const client = createSessionClient(
    {
      getAll: () => request.cookies.getAll().map(({ name, value }) => ({ name, value })),
      set: (name, value, options) => {
        refreshed.push({ name, value, options });
      },
    },
    {
      onHeaders: (received) => {
        // Anything that set a session cookie must never be cached and shared.
        headers = { ...headers, ...received };
      },
    },
  );

  // getUser asks the auth server, so a forged or revoked cookie does not count as signed in.
  const { data } = await client.auth.getUser();
  const target = loginRedirectFor(request.nextUrl.pathname, request.nextUrl.search, data.user !== null);
  if (target !== null) {
    const redirect = NextResponse.redirect(new URL(target, request.url));
    redirect.headers.set("cache-control", "no-store");
    return respondWithSession(request, refreshed, headers, redirect);
  }
  return respondWithSession(request, refreshed, headers);
}

export const config = {
  // Pages only: not static files, images or the API, which do their own checks.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
