import { sessionClientForRequest } from "../../../../../server/auth/request-session";
import { createSignOutHandler } from "../../../../../server/auth/sign-out-handler";

// Clears the session cookies on the response, so every request is its own.
export const dynamic = "force-dynamic";

export const POST = createSignOutHandler({
  signOut: async () => {
    const client = await sessionClientForRequest();
    const { error } = await client.auth.signOut();
    if (error !== null) {
      throw error;
    }
  },
});
