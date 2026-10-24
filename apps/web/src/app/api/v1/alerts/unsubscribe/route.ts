import { createUnsubscribeHandler } from "../../../../../server/alerts/unsubscribe-handler";
import { unsubscribeFromAlert } from "../../../../../server/alerts/unsubscribe-repo";
import { createPublicClient } from "../../../../../server/public-client";
import { createRequestLimiter } from "../../../../../server/request-limiter";

// Called from an email, so there is no session: read fresh on every request, never cached.
export const dynamic = "force-dynamic";

// Someone stopping alert emails does it once. 20 a minute per caller is far beyond that, and far
// below a script guessing ids.
const UNSUBSCRIBES_PER_MINUTE = 20;

export const POST = createUnsubscribeHandler({
  limit: createRequestLimiter({ max: UNSUBSCRIBES_PER_MINUTE, windowMs: 60_000, now: () => Date.now() }),
  unsubscribe: (alertId) => unsubscribeFromAlert(createPublicClient(), alertId),
});
