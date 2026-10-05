import { sessionClientForRequest } from "../../../../../server/auth/request-session";
import { createProfileHandlers } from "../../../../../server/profile/profile-handler";
import { loadProfile, saveProfile } from "../../../../../server/profile/profile-repo";
import { withinLimit } from "../../../../../server/rate-limit";

// A student's own data: read fresh on every request, never cached.
export const dynamic = "force-dynamic";

// 30 saves an hour is far beyond anyone editing their profile, and far below a flood.
const SAVES_PER_HOUR = 30;

/** One set of handlers per request, so the whole request shares a single session client. */
function handlers() {
  let client: ReturnType<typeof sessionClientForRequest> | undefined;
  const session = () => (client ??= sessionClientForRequest());

  return createProfileHandlers({
    getUserId: async () => (await (await session()).auth.getUser()).data.user?.id ?? null,
    load: async () => loadProfile(await session()),
    save: async (userId, input) => saveProfile(await session(), userId, input),
    allowWrite: async () => withinLimit(await session(), "profile", SAVES_PER_HOUR, "1 hour"),
  });
}

export const GET = (request: Request) => handlers().GET(request);
export const PUT = (request: Request) => handlers().PUT(request);
