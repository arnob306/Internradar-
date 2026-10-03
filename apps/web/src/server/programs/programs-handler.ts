import { fail, ok } from "@internradar/domain";
import { melbourneDate } from "../../features/programs/melbourne-date";
import { parseProgramsQuery, type ProgramsQuery } from "../../features/programs/programs-query";
import type { ProgramListItem, ProgramsPage, ProgramWindowItem } from "./list-programs";

/** What the public API says about a program. The raw eligibility rules stay on the server. */
export interface PublicProgram {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly programType: ProgramListItem["programType"];
  readonly cities: readonly string[];
  readonly disciplines: readonly string[];
  readonly sourceUrl: string;
  readonly company: ProgramListItem["company"];
  readonly status: ProgramListItem["status"];
  readonly windows: readonly ProgramWindowItem[];
  readonly rulesVerified: boolean;
}

export interface ProgramsHandlerDeps {
  readonly list: (query: ProgramsQuery, today: string) => Promise<ProgramsPage>;
  readonly now: () => Date;
}

// A good answer can sit in a CDN for a minute: the catalog changes a few times a week.
const CACHE_PUBLIC = "public, s-maxage=60, stale-while-revalidate=300";
const CACHE_NONE = "no-store";

function json(body: unknown, status: number, cacheControl: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": cacheControl },
  });
}

/** The public view of a program, shared by the API and the pages so neither exposes more. */
export function toPublicProgram(item: ProgramListItem): PublicProgram {
  return {
    id: item.id,
    slug: item.slug,
    name: item.name,
    programType: item.programType,
    cities: item.cities,
    disciplines: item.disciplines,
    sourceUrl: item.sourceUrl,
    company: item.company,
    status: item.status,
    windows: item.windows,
    rulesVerified: item.rulesVerified,
  };
}

/** GET /api/v1/programs: validate the query, list published programs, answer in the envelope. */
export function createProgramsHandler(deps: ProgramsHandlerDeps): (request: Request) => Promise<Response> {
  return async (request) => {
    const parsed = parseProgramsQuery(new URL(request.url).searchParams);
    if (!parsed.ok) {
      return json(fail("VALIDATION_ERROR", "Some query parameters are not valid.", parsed.fields), 400, CACHE_NONE);
    }

    try {
      const { items, total } = await deps.list(parsed.value, melbourneDate(deps.now()));
      const { limit, offset } = parsed.value;
      return json(
        ok(items.map(toPublicProgram), { total, page: Math.floor(offset / limit) + 1, limit }),
        200,
        CACHE_PUBLIC,
      );
    } catch {
      // Whatever went wrong (a database message can name tables and columns) stays on the
      // server; the visitor gets a generic answer.
      return json(fail("INTERNAL_ERROR", "Something went wrong. Please try again."), 500, CACHE_NONE);
    }
  };
}
