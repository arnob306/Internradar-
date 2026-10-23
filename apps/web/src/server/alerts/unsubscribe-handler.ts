import { fail, ok } from "@internradar/domain";
import { logFailure } from "../log";
import type { RequestLimiter } from "../request-limiter";

export interface UnsubscribeHandlerDeps {
  /** Counts a caller against the public limit. There is no account to count against here. */
  readonly limit: RequestLimiter;
  /** Stops alert emails for the owner of this alert. Says nothing about whether the alert exists. */
  readonly unsubscribe: (alertId: string) => Promise<void>;
  /** Where failures are recorded. Defaults to the safe server logger; tests pass a spy. */
  readonly log?: (scope: string, error: unknown) => void;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORM = "application/x-www-form-urlencoded";
// RFC 8058: the mail provider posts exactly this field. Anything else is not that request.
const ONE_CLICK_FIELD = "List-Unsubscribe";
const ONE_CLICK_VALUE = "One-Click";
// The form is one short field. Anything far bigger is not it.
const MAX_BODY_CHARACTERS = 1024;

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

const invalid = (message: string): Response => json(fail("VALIDATION_ERROR", message), 400);

/**
 * POST /api/v1/alerts/unsubscribe?alert={id}: the one-click unsubscribe a mail provider sends from
 * the List-Unsubscribe header (RFC 8058), and the call the confirm page makes. It is the one write
 * route that does not need a session or JSON, because it is called from an email with neither. What
 * protects it is the alert id, a random uuid that only appears in the owner's own email, and the
 * limit per caller. The answer is the same for every well-formed id, so it cannot be used to find out
 * which alerts exist.
 */
export function createUnsubscribeHandler(deps: UnsubscribeHandlerDeps): (request: Request) => Promise<Response> {
  const record = deps.log ?? logFailure;

  return async (request) => {
    const verdict = deps.limit(request);
    if (!verdict.allowed) {
      return json(fail("RATE_LIMITED", "Too many requests. Please wait a moment and try again."), 429, {
        "retry-after": String(verdict.retryAfterSeconds),
      });
    }

    const mediaType = (request.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
    if (mediaType !== FORM) {
      return json(fail("UNSUPPORTED_MEDIA_TYPE", "Send the request as a form."), 415);
    }

    const alertId = new URL(request.url).searchParams.get("alert");
    if (alertId === null || !UUID.test(alertId)) {
      return invalid("This link is not valid.");
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY_CHARACTERS || new URLSearchParams(raw).get(ONE_CLICK_FIELD) !== ONE_CLICK_VALUE) {
      return invalid("This request is not valid.");
    }

    try {
      await deps.unsubscribe(alertId);
      return json(ok({ unsubscribed: true }), 200);
    } catch (error) {
      record("api.alerts.unsubscribe", error);
      return json(fail("INTERNAL_ERROR", "Something went wrong. Please try again."), 500);
    }
  };
}
