const PROTECTED_ROOTS = ["/profile", "/tracker"] as const;

function isProtected(pathname: string): boolean {
  return PROTECTED_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

/**
 * Where to send a request instead, or null to let it through. A visitor asking for a page that
 * needs an account goes to sign-in, with the page they wanted remembered as an on-site path (it
 * always starts with the page's own "/", and the callback re-checks it before using it).
 */
export function loginRedirectFor(pathname: string, search: string, isSignedIn: boolean): string | null {
  if (isSignedIn || !isProtected(pathname)) {
    return null;
  }
  return `/login?next=${encodeURIComponent(pathname + search)}`;
}
