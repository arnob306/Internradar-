import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache, type ReactElement } from "react";
import { ProgramDetail } from "../../../../components/ProgramDetail";
import { slugFromPath } from "../../../../features/programs/detail-guards";
import { melbourneDate } from "../../../../features/programs/melbourne-date";
import { sessionClientForRequest } from "../../../../server/auth/request-session";
import { logFailure } from "../../../../server/log";
import { getProgram } from "../../../../server/programs/list-programs";
import { toPublicProgram } from "../../../../server/programs/programs-handler";
import { viewerFor } from "../../../../server/programs/viewer";

// Built for whoever is asking, from their session, on every request.
export const dynamic = "force-dynamic";

interface PageProps {
  readonly params: Promise<{ readonly company: string; readonly program: string }>;
}

/** Both path segments as plain slugs, or null: a page that cannot exist is never looked up. */
async function slugsFrom(params: PageProps["params"]): Promise<{ company: string; program: string } | null> {
  const raw = await params;
  const company = slugFromPath(raw.company);
  const program = slugFromPath(raw.program);
  return company === null || program === null ? null : { company, program };
}

// The title and the page both need the program; this asks the database once per request.
const loadProgram = cache(async (company: string, program: string, today: string) => {
  const client = await sessionClientForRequest();
  return { client, item: await getProgram(client, company, program, today) };
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  try {
    const slugs = await slugsFrom(params);
    const { item } = slugs === null ? { item: null } : await loadProgram(slugs.company, slugs.program, melbourneDate(new Date()));
    return { title: item === null ? "Program" : `${item.name} at ${item.company.name}` };
  } catch {
    // The page itself reports the failure; a title must never be the thing that breaks.
    return { title: "Program" };
  }
}

export default async function ProgramPage({ params }: PageProps): Promise<ReactElement> {
  const slugs = await slugsFrom(params);
  if (slugs === null) {
    notFound();
  }
  const today = melbourneDate(new Date());

  let loaded: Awaited<ReturnType<typeof loadProgram>>;
  try {
    loaded = await loadProgram(slugs.company, slugs.program, today);
  } catch (error) {
    // Only a safe summary is logged. A visitor needs to know to try again, not why.
    logFailure("page.program.load", error);
    return (
      <main className="page detail-page">
        <p className="notice">We couldn&apos;t load this program right now. Please try again in a moment.</p>
      </main>
    );
  }
  if (loaded.item === null) {
    notFound();
  }

  const viewer = await viewerFor(loaded.client, [loaded.item], today);
  return (
    <main className="page detail-page">
      <ProgramDetail
        program={toPublicProgram(loaded.item)}
        prompt={viewer.prompt}
        {...(viewer.eligibility?.[loaded.item.id] === undefined ? {} : { eligibility: viewer.eligibility[loaded.item.id] })}
      />
    </main>
  );
}
