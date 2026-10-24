import { fail, ok } from "@internradar/domain";
import { guardMutation } from "../guard-mutation";
import { logFailure } from "../log";

export interface FollowsHandlerDeps {
  /** Who is asking, from the session cookie. Null for a visitor. Never taken from the request. */
  readonly getUserId: () => Promise<string | null>;
  /** False once this student has changed follows too often in the current window. */
  readonly allowWrite: () => Promise<boolean>;
  /** Follows the program; false when it does not exist or is not published. Safe to repeat. */
  readonly follow: (userId: string, programId: string) => Promise<boolean>;
  /** Stops following; safe to repeat, and a program that was never followed is not an error. */
  readonly unfollow: (userId: string, programId: string) => Promise<void>;
  /** Where failures are recorded. Defaults to the safe server logger; tests pass a spy. */
  readonly log?: (scope: string, error: unknown) => void;
}

type ItemHandler = (request: Request, programId: string) => Promise<Response>;

// A follow is one student's private choice, so no cache may keep a copy.
const PRIVATE = "private, no-store";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": PRIVATE, ...headers },
  });
}

const unauthenticated = (): Response => json(fail("UNAUTHENTICATED", "Sign in to continue."), 401);
const notFound = (): Response => json(fail("PROGRAM_NOT_FOUND", "We couldn't find that program."), 404);
const generic = (): Response => json(fail("INTERNAL_ERROR", "Something went wrong. Please try again."), 500);

function tooFast(): Response {
  return json(fail("RATE_LIMITED", "You are changing things too quickly. Please wait a minute and try again."), 429, {
    "retry-after": "60",
  });
}

/**
 * The handlers for /api/v1/me/follows/{programId}. Who is following always comes from the session,
 * never from the request, and no body is read at all. For a write the order is: where it came from,
 * who is asking, whether they are changing things too often, and only then the program.
 */
export function createFollowHandlers(deps: FollowsHandlerDeps): { follow: ItemHandler; unfollow: ItemHandler } {
  const record = deps.log ?? logFailure;

  /** The checks every write makes, in order. Returns the refusal, or the signed-in student. */
  async function beforeWrite(
    request: Request,
    programId: string,
  ): Promise<{ refusal: Response } | { userId: string }> {
    const refusal = guardMutation(request);
    if (refusal !== null) {
      return { refusal };
    }
    const userId = await deps.getUserId();
    if (userId === null) {
      return { refusal: unauthenticated() };
    }
    if (!(await deps.allowWrite())) {
      return { refusal: tooFast() };
    }
    return UUID.test(programId) ? { userId } : { refusal: notFound() };
  }

  return {
    follow: async (request, programId) => {
      const checked = await beforeWrite(request, programId);
      if ("refusal" in checked) {
        return checked.refusal;
      }
      try {
        return (await deps.follow(checked.userId, programId))
          ? json(ok({ programId, following: true }), 200)
          : notFound();
      } catch (error) {
        record("api.follows.follow", error);
        return generic();
      }
    },

    unfollow: async (request, programId) => {
      const checked = await beforeWrite(request, programId);
      if ("refusal" in checked) {
        return checked.refusal;
      }
      try {
        await deps.unfollow(checked.userId, programId);
        return json(ok({ programId, following: false }), 200);
      } catch (error) {
        record("api.follows.unfollow", error);
        return generic();
      }
    },
  };
}
