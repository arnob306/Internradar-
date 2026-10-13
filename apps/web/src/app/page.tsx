import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement } from "react";
import { TimelineChart } from "../components/TimelineChart";
import { TimelineFilters } from "../components/TimelineFilters";
import { melbourneDate } from "../features/programs/melbourne-date";
import { MAX_LIMIT } from "../features/programs/programs-query";
import { buildTimeline } from "../features/timeline/build-timeline";
import { summariseTimeline } from "../features/timeline/summarise";
import { chartFor } from "../features/timeline/timeline-bars";
import { parseTimelineFilter } from "../features/timeline/timeline-filter";
import { listApplications } from "../server/applications/applications-repo";
import { sessionClientForRequest } from "../server/auth/request-session";
import { logFailure } from "../server/log";
import { listPrograms, type ProgramsPage } from "../server/programs/list-programs";
import { toPublicProgram } from "../server/programs/programs-handler";

export const metadata: Metadata = { title: "When applications open" };

// Built from the visitor's session on every request: the dates and the saved badges are current.
export const dynamic = "force-dynamic";

type Client = Awaited<ReturnType<typeof sessionClientForRequest>>;
type SearchParams = Record<string, string | string[] | undefined>;

const HEADLINE = "Never miss an application window.";

/** The programs this student saved. A visitor, or any failure, simply has none: the page still works. */
async function savedProgramIds(client: Client): Promise<string[]> {
  let signedIn = false;
  try {
    signedIn = (await client.auth.getUser()).data.user !== null;
  } catch (error) {
    logFailure("page.timeline.session", error);
  }
  if (!signedIn) {
    return [];
  }
  try {
    return (await listApplications(client)).map((application) => application.programId);
  } catch (error) {
    logFailure("page.timeline.saved", error);
    return [];
  }
}

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

function toParams(raw: SearchParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) {
        params.append(key, item);
      }
    }
  }
  return params;
}

export default async function HomePage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}): Promise<ReactElement> {
  const filter = parseTimelineFilter(toParams(await searchParams));
  const today = melbourneDate(new Date());

  let page: ProgramsPage;
  let saved: string[];
  try {
    const client = await sessionClientForRequest();
    page = await listPrograms(
      client,
      { limit: MAX_LIMIT, offset: 0, type: filter.type, discipline: undefined, openNow: false },
      today,
    );
    saved = await savedProgramIds(client);
  } catch (error) {
    // Only a safe summary is logged. A visitor needs to know to try again, not why.
    logFailure("page.timeline.load", error);
    return (
      <main className="page timeline-page">
        <h1 className="home-title">{HEADLINE}</h1>
        <p className="notice">We couldn&apos;t load the timeline right now. Please try again in a moment.</p>
      </main>
    );
  }

  const timeline = buildTimeline(page.items.map(toPublicProgram), today, saved);
  const summary = summariseTimeline(timeline);
  const chart = chartFor(timeline, today);
  return (
    <main className="page timeline-page">
      <h1 className="home-title">{HEADLINE}</h1>
      <p className="home-lede muted">
        Large employers rarely announce when they open. See each program&apos;s window and when to start preparing.
      </p>
      <ul className="summary" aria-label="Programs at a glance">
        <li>{count(summary.total, "program", "programs")}</li>
        <li>{summary.openNow} open now</li>
        <li>{summary.openingSoon} opening soon</li>
        <li>{summary.estimated} estimated from earlier years</li>
        <li>{summary.notAnnounced} with no dates announced</li>
      </ul>
      <div className="timeline-toolbar">
        <TimelineFilters current={filter.type} />
        <Link href="/programs">Browse all programs</Link>
      </div>
      {!filter.isValid && (
        <p className="notice">
          The filter in that link wasn&apos;t valid, so it was ignored. <Link href="/">Show all programs</Link>
        </p>
      )}
      {page.items.length < page.total && (
        <p className="notice">
          Showing the first {page.items.length} of {page.total} programs.
        </p>
      )}
      {filter.type !== undefined && page.items.length === 0 ? (
        <p className="notice">
          No {filter.type} programs to show yet. <Link href="/">Show all programs</Link>
        </p>
      ) : (
        <TimelineChart chart={chart} />
      )}
      <p className="home-footnote muted">
        Dates change: always confirm on the employer&apos;s own page before you plan around one.
      </p>
    </main>
  );
}
