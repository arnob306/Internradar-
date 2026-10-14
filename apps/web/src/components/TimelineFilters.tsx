import Link from "next/link";
import type { ReactElement } from "react";
import { TIMELINE_FILTERS, timelineHref, type TimelineType } from "../features/timeline/timeline-filter";

/**
 * Plain links to the same timeline, narrowed. They work without JavaScript, and aria-current says
 * which is selected so the choice is never carried by colour alone.
 */
export function TimelineFilters({ current }: { readonly current: TimelineType | undefined }): ReactElement {
  return (
    <nav className="filters" aria-label="Filter the timeline">
      {TIMELINE_FILTERS.map(({ type, label }) => (
        <Link
          key={label}
          href={timelineHref(type)}
          className="filter"
          {...(type === current ? { "aria-current": "true" as const } : {})}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
