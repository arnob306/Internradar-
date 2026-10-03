import Link from "next/link";
import type { ReactElement } from "react";
import { ProgramFeed } from "../components/ProgramFeed";
import { melbourneDate } from "../features/programs/melbourne-date";
import {
  DEFAULT_LIMIT,
  parseProgramsQuery,
  type ProgramsQuery,
} from "../features/programs/programs-query";
import { listPrograms, type ProgramsPage } from "../server/programs/list-programs";
import { toPublicProgram } from "../server/programs/programs-handler";
import { createPublicClient } from "../server/public-client";

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

export default async function HomePage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}): Promise<ReactElement> {
  const parsed = parseProgramsQuery(toParams(await searchParams));
  const query = parsed.ok ? parsed.value : DEFAULT_QUERY;

  let page: ProgramsPage | undefined;
  try {
    page = await listPrograms(createPublicClient(), query, melbourneDate(new Date()));
  } catch {
    // The reason stays on the server. A visitor only needs to know to try again.
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
        />
      )}

      <p className="home-footnote muted">
        Eligibility is a guide: always confirm on the employer&apos;s own page before you apply.
      </p>
    </main>
  );
}
