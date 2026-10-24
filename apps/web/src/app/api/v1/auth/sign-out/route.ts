import { sessionClientForRequest } from "../../../../../server/auth/request-session";
import { createSignOutHandler } from "../../../../../server/auth/sign-out-handler";
import { signOutThisDevice } from "../../../../../server/auth/sign-out-session";

// Clears the session cookies on the response, so every request is its own.
export const dynamic = "force-dynamic";

export const POST = createSignOutHandler({
  signOut: async () => signOutThisDevice(await sessionClientForRequest()),
});
