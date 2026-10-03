import { fail } from "@internradar/domain";

function refuse(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify(fail(code, message)), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/**
 * The checks every state-changing route makes before it reads anything. Returns the refusal to
 * send, or null to carry on.
 *
 * Two independent defences against cross-site request forgery. A browser always sends an Origin
 * header on a cross-site POST or PUT, so one that is not this site is refused (a request with
 * no Origin is not from a browser, so it is allowed through to the other checks). And a page on
 * another site cannot send `application/json` without a preflight this site never approves, so
 * requiring it also stops plain form posts.
 */
export function guardMutation(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== new URL(request.url).origin) {
    return refuse(403, "FORBIDDEN_ORIGIN", "This request did not come from this site.");
  }

  const mediaType = (request.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    return refuse(415, "UNSUPPORTED_MEDIA_TYPE", "Send the request as application/json.");
  }
  return null;
}
