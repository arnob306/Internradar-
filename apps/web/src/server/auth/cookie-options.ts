import type { CookieOptions } from "@supabase/ssr";

/**
 * The attributes every session cookie gets, whatever the auth library asks for. The library's
 * defaults are tuned for a browser client that reads its own cookie; this site signs people in
 * on the server only, so the cookie can be locked down:
 *
 *  - httpOnly: JavaScript on the page can never read the session, so an XSS bug cannot steal it.
 *  - SameSite=Lax: it is not sent on cross-site POSTs, which blunts cross-site request forgery.
 *  - Secure in production, but not in local development, where the site is plain http.
 *  - No Domain: the cookie belongs to this host alone, not to its subdomains.
 *
 * The lifetime the library chose (including 0, which deletes the cookie) is kept as it is.
 */
export function hardenCookie(options: CookieOptions | undefined, production: boolean): CookieOptions {
  const hardened: CookieOptions = { ...options };
  delete hardened.domain;
  return { ...hardened, httpOnly: true, sameSite: "lax", secure: production, path: "/" };
}
