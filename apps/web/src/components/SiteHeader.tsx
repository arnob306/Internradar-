import Link from "next/link";
import type { ReactElement } from "react";
import { SignOutButton } from "./SignOutButton";

/**
 * The site header. A visitor sees a way in; a signed-in student sees their tracker, their profile
 * and a way out.
 */
export function SiteHeader({ signedIn = false }: { readonly signedIn?: boolean }): ReactElement {
  return (
    <header className="site-header">
      <div className="page site-header-inner">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="4.5" />
              <path d="M12 12 19 6" />
            </svg>
          </span>
          InternRadar
        </Link>
        <nav aria-label="Main">
          <Link href="/" aria-current="page">
            Programs
          </Link>
          {signedIn ? (
            <>
              <Link href="/tracker">Tracker</Link>
              <Link href="/profile">Profile</Link>
              <SignOutButton />
            </>
          ) : (
            <Link href="/login">Sign in</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
