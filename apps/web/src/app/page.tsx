import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import type { ReactElement } from "react";
import { ProgramFeed } from "../components/ProgramFeed";
import type { CardEligibility } from "../components/ProgramCard";
import { eligibilityForFeed } from "../features/programs/feed-eligibility";
import { melbourneDate } from "../features/programs/melbourne-date";
import {
  DEFAULT_LIMIT,
  parseProgramsQuery,
  type ProgramsQuery,
} from "../features/programs/programs-query";
import { sessionClientForRequest } from "../server/auth/request-session";
import type { Database } from "../server/db/database.types";
import { logFailure } from "../server/log";
import { listPrograms, type ProgramListItem, type ProgramsPage } from "../server/programs/list-programs";
import { toPublicProgram } from "../server/programs/programs-handler";
import { loadProfile } from "../server/profile/profile-repo";
import { toStudentProfile } from "../server/profile/profile-row";

// The feed reads the database on every request, so it is always current.
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const DEFAULT_QUERY: ProgramsQuery = {
  limit: DEFAULT_LIMIT,
  offset: 0,
  type: undefined,
  discipline: undefined,
  openNow: false,
};

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

interface Viewer {
  /** An answer for each program, once the student is signed in and has a profile. */
  readonly eligibility?: Record<string, CardEligibility>;
  /** What each card asks for while it has no answer. */
  readonly prompt: "sign-in" | "profile";
}

/**
 * What this visitor can be told about each program. A visitor is asked to sign in; a student with
 * no profile is asked to add one; one with a profile gets the engine's answer. If the session or
 * the profile cannot be read, the programs still show and the card simply asks again: a lookup
 * that fails must never take the feed down, or be mistaken for an answer.
 */
async function viewerFor(
  client: SupabaseClient<Database>,
  items: readonly ProgramListItem[],
  today: string,
): Promise<Viewer> {
  let signedIn = false;
  try {
    signedIn = (await client.auth.getUser()).data.user !== null;
  } catch (error) {
    logFailure("page.home.session", error);
  }
  if (!signedIn) {
    return { prompt: "sign-in" };
  }

  try {
    const profile = await loadProfile(client);
    if (profile === null) {
      return { prompt: "profile" };
    }
    return { prompt: "profile", eligibility: eligibilityForFeed(items, toStudentProfile(profile), today) };
  } catch (error) {
    logFailure("page.home.profile", error);
    return { prompt: "profile" };
  }
}

export default async function HomePage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}): Promise<ReactElement> {
  const parsed = parseProgramsQuery(toParams(await searchParams));
  const query = parsed.ok ? parsed.value : DEFAULT_QUERY;
  const today = melbourneDate(new Date());

  let page: ProgramsPage | undefined;
  let viewer: Viewer = { prompt: "sign-in" };
  try {
    const client = await sessionClientForRequest();
    page = await listPrograms(client, query, today);
    viewer = await viewerFor(client, page.items, today);
  } catch (error) {
    // The reason stays on the server, and only a safe summary is logged. A visitor only needs to
    // know to try again.
    logFailure("page.home.list", error);
    page = undefined;
  }

  return (
    <main className="page home">
      <h1 className="home-title">Graduate and internship programs, checked against you.</h1>
      <p className="home-lede muted">
        Every program links to the employer&apos;s own page. We show whether you&apos;re eligible,
        and say so plainly when we can&apos;t tell.
      </p>

      {!parsed.ok && (
        <p className="notice">
          Some filters in that link weren&apos;t valid, so they were ignored.{" "}
          <Link href="/">Clear filters</Link>
        </p>
      )}

      {page === undefined ? (
        <p className="notice">We couldn&apos;t load programs right now. Please try again in a moment.</p>
      ) : (
        <ProgramFeed
          programs={page.items.map(toPublicProgram)}
          total={page.total}
          query={query}
          prompt={viewer.prompt}
          {...(viewer.eligibility === undefined ? {} : { eligibility: viewer.eligibility })}
        />
      )}

      <p className="home-footnote muted">
        Eligibility is a guide: always confirm on the employer&apos;s own page before you apply.
      </p>
    </main>
  );
}
