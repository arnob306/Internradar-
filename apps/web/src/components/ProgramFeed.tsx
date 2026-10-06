import type { ProgramType } from "@internradar/domain";
import Link from "next/link";
import type { ReactElement } from "react";
import { feedHref } from "../features/programs/feed-href";
import type { ProgramsQuery } from "../features/programs/programs-query";
import type { PublicProgram } from "../server/programs/programs-handler";
import { ProgramCard, type CardEligibility } from "./ProgramCard";

interface ProgramFeedProps {
  readonly programs: readonly PublicProgram[];
  /** How many programs match the filters across every page. */
  readonly total: number;
  readonly query: ProgramsQuery;
  /** Per-program eligibility, once the visitor is signed in. Keyed by program id. */
  readonly eligibility?: Readonly<Record<string, CardEligibility>>;
  /** What each card asks for while it has no answer. */
  readonly prompt?: "sign-in" | "profile";
}

const TYPE_FILTERS: readonly { readonly type: ProgramType; readonly label: string }[] = [
  { type: "graduate", label: "Graduate" },
  { type: "vacationer", label: "Vacationer" },
];

function FilterLink(props: {
  readonly href: string;
  readonly current: boolean;
  readonly children: string;
}): ReactElement {
  // Plain links: they work without JavaScript, and aria-current says which is selected so the
  // choice is never carried by colour alone.
  return (
    <Link
      href={props.href}
      className="filter"
      {...(props.current ? { "aria-current": "true" as const } : {})}
    >
      {props.children}
    </Link>
  );
}

export function ProgramFeed({ programs, total, query, eligibility, prompt }: ProgramFeedProps): ReactElement {
  const pages = Math.max(1, Math.ceil(total / query.limit));
  const page = Math.floor(query.offset / query.limit) + 1;

  return (
    <section aria-label="Programs">
      <nav className="filters" aria-label="Filter programs">
        <FilterLink
          href={feedHref(query, { type: undefined, openNow: false })}
          current={query.type === undefined && !query.openNow}
        >
          All programs
        </FilterLink>
        {TYPE_FILTERS.map(({ type, label }) => (
          <FilterLink
            key={type}
            href={feedHref(query, { type: query.type === type ? undefined : type })}
            current={query.type === type}
          >
            {label}
          </FilterLink>
        ))}
        <FilterLink
          href={feedHref(query, { openNow: !query.openNow })}
          current={query.openNow}
        >
          Open now
        </FilterLink>
      </nav>

      <p className="feed-count muted" aria-live="polite">
        {total} {total === 1 ? "program" : "programs"}
      </p>

      {programs.length === 0 ? (
        <div className="feed-empty">
          <p>No programs match these filters.</p>
          <Link href="/">Clear filters</Link>
        </div>
      ) : (
        <div className="program-grid">
          {programs.map((program) => {
            const verdict = eligibility?.[program.id];
            return (
              <ProgramCard
                key={program.id}
                program={program}
                {...(verdict === undefined ? {} : { eligibility: verdict })}
                {...(prompt === undefined ? {} : { prompt })}
              />
            );
          })}
        </div>
      )}

      {pages > 1 && (
        <nav className="pagination" aria-label="Pages">
          {page > 1 ? (
            <Link href={feedHref(query, { offset: Math.max(0, query.offset - query.limit) })}>
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="muted">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={feedHref(query, { offset: query.offset + query.limit })}>Next</Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </section>
  );
}
