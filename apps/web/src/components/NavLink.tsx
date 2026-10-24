"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactElement, ReactNode } from "react";

/** True when `pathname` is `base` or a page beneath it ("/tracker" matches "/tracker/x", not "/trackers"). */
function isWithin(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * A header link that says it is the current page when the student is on it. `sections` lists the
 * paths it covers (a link to "/" also covers the program pages).
 */
export function NavLink({
  href,
  sections = [href],
  children,
}: {
  readonly href: string;
  readonly sections?: readonly string[];
  readonly children: ReactNode;
}): ReactElement {
  const pathname = usePathname();
  const current = sections.some((base) => (base === "/" ? pathname === "/" : isWithin(pathname, base)));
  return (
    <Link href={href} {...(current ? { "aria-current": "page" as const } : {})}>
      {children}
    </Link>
  );
}
