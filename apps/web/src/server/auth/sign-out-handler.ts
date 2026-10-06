import { fail, ok } from "@internradar/domain";
import { guardMutation } from "../guard-mutation";
import { logFailure } from "../log";

export interface SignOutDeps {
  /** Ends the session and clears its cookies. */
  readonly signOut: () => Promise<void>;
  /** Where failures are recorded. Defaults to the safe server logger; tests pass a spy. */
  readonly log?: (scope: string, error: unknown) => void;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/**
 * POST /api/v1/auth/sign-out. It needs the same origin and JSON checks as every write, so another
 * site cannot sign a student out by getting their browser to submit a form. It is safe to call
 * twice, and needs no body.
 */
export function createSignOutHandler(deps: SignOutDeps): (request: Request) => Promise<Response> {
  return async (request) => {
    const refusal = guardMutation(request);
    if (refusal !== null) {
      return refusal;
    }
    try {
      await deps.signOut();
      return json(ok({ signedOut: true }), 200);
    } catch (error) {
      (deps.log ?? logFailure)("auth.sign-out", error);
      return json(fail("INTERNAL_ERROR", "Something went wrong. Please try again."), 500);
    }
  };
}
