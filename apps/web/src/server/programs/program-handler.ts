import { fail, ok } from "@internradar/domain";
import { slugFromPath } from "../../features/programs/detail-guards";
import { melbourneDate } from "../../features/programs/melbourne-date";
import { logFailure } from "../log";
import type { ProgramListItem } from "./list-programs";
import type { RequestLimiter } from "../request-limiter";
import { CACHE_NONE, CACHE_PUBLIC, json, toPublicProgram, tooManyRequests } from "./programs-handler";

export interface ProgramHandlerDeps {
  readonly get: (company: string, program: string, today: string) => Promise<ProgramListItem | null>;
  /** Counts each caller's requests; a caller over the limit is turned away before any other work. */
  readonly limit: RequestLimiter;
  readonly now: () => Date;
  /** Where failures are recorded. Defaults to the safe server logger; tests pass a spy. */
  readonly log?: (scope: string, error: unknown) => void;
}

interface RouteContext {
  readonly params: Promise<{ readonly company: string; readonly program: string }>;
}

// A miss is remembered briefly, so a caller trying real-looking slugs does not reach the database
// every time. Short, so a program that has just been published is not hidden for long.
const CACHE_MISSING = "public, s-maxage=30";

const notFound = (cacheControl: string): Response =>
  json(fail("PROGRAM_NOT_FOUND", "We couldn't find that program."), 404, cacheControl);

/**
 * GET /api/v1/programs/{company}/{program}: one published program by its employer's slug and its
 * own. A slug that could not exist, a draft and a missing program all get the same 404, so a
 * caller cannot tell them apart.
 */
export function createProgramHandler(deps: ProgramHandlerDeps): (request: Request, context: RouteContext) => Promise<Response> {
  return async (request, context) => {
    const verdict = deps.limit(request);
    if (!verdict.allowed) {
      return tooManyRequests(verdict.retryAfterSeconds);
    }

    const raw = await context.params;
    const company = slugFromPath(raw.company);
    const program = slugFromPath(raw.program);
    if (company === null || program === null) {
      return notFound(CACHE_NONE);
    }

    try {
      const item = await deps.get(company, program, melbourneDate(deps.now()));
      return item === null ? notFound(CACHE_MISSING) : json(ok(toPublicProgram(item)), 200, CACHE_PUBLIC);
    } catch (error) {
      // A database message can name tables and columns: it stays on the server.
      (deps.log ?? logFailure)("api.program.get", error);
      return json(fail("INTERNAL_ERROR", "Something went wrong. Please try again."), 500, CACHE_NONE);
    }
  };
}
