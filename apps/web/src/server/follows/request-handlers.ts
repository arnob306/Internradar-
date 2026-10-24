import { sessionClientForRequest } from "../auth/request-session";
import { withinLimit } from "../rate-limit";
import { createFollowHandlers } from "./follows-handler";
import { followProgram, unfollowProgram } from "./follows-repo";

// Following is a few choices a day. 60 an hour is far beyond anyone working through a list, and far
// below a script.
const CHANGES_PER_HOUR = 60;

/**
 * One set of follow handlers per request, so the whole request shares a single session client.
 * This is wiring only: the tested handlers hold the rules, and the repository holds the queries.
 */
export function followHandlersForRequest(): ReturnType<typeof createFollowHandlers> {
  let client: ReturnType<typeof sessionClientForRequest> | undefined;
  const session = () => (client ??= sessionClientForRequest());

  return createFollowHandlers({
    getUserId: async () => (await (await session()).auth.getUser()).data.user?.id ?? null,
    allowWrite: async () => withinLimit(await session(), "follow", CHANGES_PER_HOUR, "1 hour"),
    follow: async (userId, programId) => followProgram(await session(), userId, programId),
    unfollow: async (userId, programId) => unfollowProgram(await session(), userId, programId),
  });
}
