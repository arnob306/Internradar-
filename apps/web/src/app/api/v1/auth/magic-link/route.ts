import { createMagicLinkHandler } from "../../../../../server/auth/magic-link-handler";
import { sessionClientForRequest } from "../../../../../server/auth/request-session";

// Reads cookies and writes one (the sign-in verifier), so it must run on every request.
export const dynamic = "force-dynamic";

// The auth service's own limits (emails per hour, one per address per minute) are the throttle
// here: the project's database limiter needs a signed-in user, and this is the step before one.
const RATE_LIMITED = new Set(["over_email_send_rate_limit", "over_request_rate_limit"]);

export const POST = createMagicLinkHandler({
  sendLink: async (email, redirectTo) => {
    // The session client, not the anonymous one: the one-time-code sign-in stores a verifier in a
    // cookie, and the callback needs it back to finish. (All the handling is in the tested handler.)
    const client = await sessionClientForRequest();
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
    });
    if (error === null) {
      return "sent";
    }
    if (error.status === 429 || (error.code !== undefined && RATE_LIMITED.has(error.code))) {
      return "rate_limited";
    }
    throw error;
  },
});
