import type { Metadata } from "next";
import type { ReactElement } from "react";
import { TimelineChart } from "../../components/TimelineChart";
import { melbourneDate } from "../../features/programs/melbourne-date";
import { MAX_LIMIT } from "../../features/programs/programs-query";
import { buildTimeline } from "../../features/timeline/build-timeline";
import { chartFor } from "../../features/timeline/timeline-bars";
import { listApplications } from "../../server/applications/applications-repo";
import { sessionClientForRequest } from "../../server/auth/request-session";
import { logFailure } from "../../server/log";
import { listPrograms, type ProgramsPage } from "../../server/programs/list-programs";
import { toPublicProgram } from "../../server/programs/programs-handler";

export const metadata: Metadata = { title: "When applications open" };

// Built from the visitor's session on every request: the dates and the saved badges are current.
export const dynamic = "force-dynamic";

type Client = Awaited<ReturnType<typeof sessionClientForRequest>>;

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

export default async function TimelinePage(): Promise<ReactElement> {
  const today = melbourneDate(new Date());

  let page: ProgramsPage;
  let saved: string[];
  try {
    const client = await sessionClientForRequest();
    page = await listPrograms(
      client,
      { limit: MAX_LIMIT, offset: 0, type: undefined, discipline: undefined, openNow: false },
      today,
    );
    saved = await savedProgramIds(client);
  } catch (error) {
    // Only a safe summary is logged. A visitor needs to know to try again, not why.
    logFailure("page.timeline.load", error);
    return (
      <main className="page timeline-page">
        <h1 className="home-title">When applications open</h1>
        <p className="notice">We couldn&apos;t load the timeline right now. Please try again in a moment.</p>
      </main>
    );
  }

  const chart = chartFor(buildTimeline(page.items.map(toPublicProgram), today, saved), today);
  return (
    <main className="page timeline-page">
      <h1 className="home-title">When applications open</h1>
      <p className="home-lede muted">
        Large employers rarely announce when they open. Each bar shows when a program&apos;s applications are
        open, so you can see what to prepare for and when. Where an employer hasn&apos;t published dates, the bar
        shows when they were open in past years.
      </p>
      {page.items.length < page.total && (
        <p className="notice">
          Showing the first {page.items.length} of {page.total} programs.
        </p>
      )}
      <TimelineChart chart={chart} />
      <p className="home-footnote muted">
        Dates change: always confirm on the employer&apos;s own page before you plan around one.
      </p>
    </main>
  );
}
