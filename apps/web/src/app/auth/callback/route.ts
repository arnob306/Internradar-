import { createCallbackHandler } from "../../../server/auth/callback-handler";
import { sessionClientForRequest } from "../../../server/auth/request-session";

// Trades a one-time code for a session and writes the session cookies: every request is its own.
export const dynamic = "force-dynamic";

export const GET = createCallbackHandler({
  exchange: async (code) => {
    const client = await sessionClientForRequest();
    const { error } = await client.auth.exchangeCodeForSession(code);
    return error === null;
  },
});
