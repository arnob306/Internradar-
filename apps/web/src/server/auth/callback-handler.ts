import { safeNextPath } from "../../features/auth/safe-redirect";
import { logFailure } from "../log";

export interface CallbackDeps {
  /** Trade the one-time code from the emailed link for a session. False if it is not valid. */
  readonly exchange: (code: string) => Promise<boolean>;
  /** Where failures are recorded. Defaults to the safe server logger; tests pass a spy. */
  readonly log?: (scope: string, error: unknown) => void;
}

// One-time codes are short. A very long value is not one, so it is not even tried.
const MAX_CODE_CHARACTERS = 512;

/**
 * GET /auth/callback: where the emailed link lands. It signs the student in and sends them on,
 * only ever to a path on this site. A missing, expired, already-used or failing link all end the
 * same way, back at sign-in with one calm reason, so nothing about why it failed is shown.
 */
export function createCallbackHandler(deps: CallbackDeps): (request: Request) => Promise<Response> {
  return async (request) => {
    const url = new URL(request.url);
    const to = (path: string): Response =>
      new Response(null, {
        status: 307,
        headers: { location: new URL(path, url.origin).toString(), "cache-control": "no-store" },
      });
    const backToSignIn = (): Response => to("/login?error=invalid_link");

    const code = url.searchParams.get("code");
    if (code === null || code === "" || code.length > MAX_CODE_CHARACTERS) {
      return backToSignIn();
    }

    try {
      if (!(await deps.exchange(code))) {
        return backToSignIn();
      }
      return to(safeNextPath(url.searchParams.get("next")));
    } catch (error) {
      (deps.log ?? logFailure)("auth.callback", error);
      return backToSignIn();
    }
  };
}
