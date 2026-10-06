import { fail, ok, type FieldError } from "@internradar/domain";
import { parseEmail } from "../../features/auth/email";
import { safeNextPath } from "../../features/auth/safe-redirect";
import { guardMutation } from "../guard-mutation";
import { logFailure } from "../log";

/** What the auth service said when asked to send the link. */
export type SendLinkResult = "sent" | "rate_limited";

export interface MagicLinkDeps {
  readonly sendLink: (email: string, redirectTo: string) => Promise<SendLinkResult>;
  /** Where failures are recorded. Defaults to the safe server logger; tests pass a spy. */
  readonly log?: (scope: string, error: unknown) => void;
}

// An email address and a path need a few hundred bytes. Anything bigger is not a real request.
const MAX_BODY_CHARACTERS = 2048;
const ALLOWED_KEYS: ReadonlySet<string> = new Set(["email", "next"]);

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

function invalid(fields: readonly FieldError[]): Response {
  return json(fail("VALIDATION_ERROR", "Please check the email address and try again.", fields), 400);
}

/**
 * POST /api/v1/auth/magic-link: email someone a sign-in link. It answers the same way for every
 * valid address, whether or not an account exists, so it can never be used to find out who is
 * registered. The link is built from this request's own origin, never from anything in the body
 * or the headers, and its destination can only be a path on this site.
 */
export function createMagicLinkHandler(deps: MagicLinkDeps): (request: Request) => Promise<Response> {
  return async (request) => {
    const refusal = guardMutation(request);
    if (refusal !== null) {
      return refusal;
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY_CHARACTERS) {
      return invalid([{ field: "body", message: "The request is too large." }]);
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return invalid([{ field: "body", message: "The request must be valid JSON." }]);
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return invalid([{ field: "body", message: "The request must be a JSON object." }]);
    }

    const fields: FieldError[] = [];
    for (const key of Object.keys(body)) {
      if (!ALLOWED_KEYS.has(key)) {
        fields.push({ field: key, message: `Unknown field "${key}".` });
      }
    }
    const email = parseEmail((body as Record<string, unknown>)["email"]);
    if (email === null) {
      fields.push({ field: "email", message: "Enter a valid email address." });
    }
    if (fields.length > 0 || email === null) {
      return invalid(fields);
    }

    const next = safeNextPath((body as Record<string, unknown>)["next"]);
    const redirectTo = `${new URL(request.url).origin}/auth/callback?next=${encodeURIComponent(next)}`;

    try {
      const result = await deps.sendLink(email, redirectTo);
      if (result === "rate_limited") {
        return json(
          fail("RATE_LIMITED", "Too many sign-in emails. Please wait a minute and try again."),
          429,
          { "retry-after": "60" },
        );
      }
      return json(ok({ sent: true }), 200);
    } catch (error) {
      // The reason (a mail server's message can include credentials or hostnames) stays on the
      // server, and only a safe summary is logged.
      (deps.log ?? logFailure)("auth.magic-link", error);
      return json(fail("INTERNAL_ERROR", "Something went wrong. Please try again."), 500);
    }
  };
}
