import type { Industry } from "@internradar/domain";
import Link from "next/link";
import type { ReactElement } from "react";
import { INDUSTRY_FILTERS, timelineHref, type TimelineType } from "../features/timeline/timeline-filter";

/**
 * Plain links to the same timeline, narrowed to one industry. The chosen type is kept, so the two
 * filters combine. They work without JavaScript, and aria-current says which is selected.
 */
export function IndustryFilters({
  current,
  type,
}: {
  readonly current: Industry | undefined;
  readonly type: TimelineType | undefined;
}): ReactElement {
  return (
    <nav className="filters" aria-label="Filter by industry">
      {INDUSTRY_FILTERS.map(({ industry, label }) => (
        <Link
          key={label}
          href={timelineHref(type, industry)}
          className="filter"
          {...(industry === current ? { "aria-current": "true" as const } : {})}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
