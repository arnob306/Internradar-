import { NextResponse, type NextRequest } from "next/server";
import { loginRedirectFor } from "./features/auth/protected-paths";
import { createSessionClient } from "./server/auth/session-client";

/**
 * Runs before every page. It keeps a signed-in student's session fresh (access tokens last an
 * hour, and only a place that can set cookies can renew one) and sends visitors away from pages
 * that need an account. The rules live in tested modules; this only connects them.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const client = createSessionClient(
    {
      getAll: () => request.cookies.getAll().map(({ name, value }) => ({ name, value })),
      set: (name, value, options) => {
        // Carry the renewed cookie on both the rest of this request and the response.
        request.cookies.set(name, value);
        response = NextResponse.next({ request });
        response.cookies.set(name, value, options);
      },
    },
    {
      onHeaders: (headers) => {
        // Anything that set a session cookie must never be cached and shared.
        for (const [name, value] of Object.entries(headers)) {
          response.headers.set(name, value);
        }
      },
    },
  );

  // getUser asks the auth server, so a forged or revoked cookie does not count as signed in.
  const { data } = await client.auth.getUser();
  const target = loginRedirectFor(request.nextUrl.pathname, request.nextUrl.search, data.user !== null);
  if (target !== null) {
    const redirect = NextResponse.redirect(new URL(target, request.url));
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    redirect.headers.set("cache-control", "no-store");
    return redirect;
  }
  return response;
}

export const config = {
  // Pages only: not static files, images or the API, which do their own checks.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
