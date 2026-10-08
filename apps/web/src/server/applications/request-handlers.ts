import { melbourneDate } from "../../features/programs/melbourne-date";
import { sessionClientForRequest } from "../auth/request-session";
import { withinLimit } from "../rate-limit";
import { createApplicationHandlers } from "./applications-handler";
import {
  findApplication,
  latestChange,
  listApplications,
  removeApplication,
  saveApplication,
  updateApplication,
} from "./applications-repo";

// Saving programs and moving them along is a few actions a day. 60 an hour is far beyond anyone
// working through a list, and far below a script.
const CHANGES_PER_HOUR = 60;

/**
 * One set of tracker handlers per request, so the whole request shares a single session client.
 * This is wiring only: the tested handlers hold the rules, and the repository holds the queries.
 */
export function applicationHandlersForRequest(): ReturnType<typeof createApplicationHandlers> {
  let client: ReturnType<typeof sessionClientForRequest> | undefined;
  const session = () => (client ??= sessionClientForRequest());

  return createApplicationHandlers({
    getUserId: async () => (await (await session()).auth.getUser()).data.user?.id ?? null,
    allowWrite: async () => withinLimit(await session(), "tracker", CHANGES_PER_HOUR, "1 hour"),
    list: async () => listApplications(await session()),
    save: async (userId, programId) =>
      saveApplication(await session(), userId, programId, melbourneDate(new Date())),
    find: async (id) => findApplication(await session(), id),
    latestChange: async (id) => latestChange(await session(), id),
    update: async (id, change, expectedStatus) =>
      updateApplication(await session(), id, change, expectedStatus),
    remove: async (id) => removeApplication(await session(), id),
    now: () => new Date(),
  });
}
