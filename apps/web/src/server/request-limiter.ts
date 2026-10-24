/** Whether a request may go ahead and, if not, how long the client should wait. */
export interface LimitResult {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

export type RequestLimiter = (request: Request) => LimitResult;

const MAX_KEY_LENGTH = 64;
const UNKNOWN_CLIENT = "unknown";
const OVERFLOW_CLIENT = "overflow";
const DEFAULT_MAX_CLIENTS = 10_000;

/**
 * Who a public request came from, for counting. The hosting proxy sets `x-real-ip` (or puts the
 * client first in `x-forwarded-for`); a caller with neither shares one bucket instead of being let
 * through. The key is capped in length so a huge header cannot be used to fill memory.
 */
export function clientKey(request: Request): string {
  const real = request.headers.get("x-real-ip")?.trim();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const key = real || forwarded || UNKNOWN_CLIENT;
  return key.slice(0, MAX_KEY_LENGTH);
}

interface Counter {
  windowStart: number;
  hits: number;
}

export interface RequestLimiterOptions {
  /** Requests one client may make in a window. */
  readonly max: number;
  readonly windowMs: number;
  readonly now: () => number;
  /** How many clients are remembered at once; further new clients share one overflow bucket. */
  readonly maxClients?: number;
}

/**
 * A fixed-window limit per client, kept in this server's memory. It is a guard against a single
 * caller hammering the public API, not a guarantee across instances (each holds its own counts), so
 * a platform-level limit is still worth setting when this is deployed. Memory is bounded: at most
 * `maxClients` clients plus the shared overflow bucket are ever held.
 */
export function createRequestLimiter(options: RequestLimiterOptions): RequestLimiter {
  const { max, windowMs, now, maxClients = DEFAULT_MAX_CLIENTS } = options;
  const counters = new Map<string, Counter>();

  const forgetFinished = (time: number): void => {
    for (const [key, counter] of counters) {
      if (time - counter.windowStart >= windowMs) {
        counters.delete(key);
      }
    }
  };

  return (request) => {
    const time = now();
    let key = clientKey(request);
    if (!counters.has(key) && counters.size >= maxClients) {
      forgetFinished(time);
      if (counters.size >= maxClients) {
        key = OVERFLOW_CLIENT;
      }
    }

    let counter = counters.get(key);
    if (counter === undefined || time - counter.windowStart >= windowMs) {
      counter = { windowStart: time, hits: 0 };
      counters.set(key, counter);
    }
    counter.hits += 1;

    const remainingMs = counter.windowStart + windowMs - time;
    return { allowed: counter.hits <= max, retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)) };
  };
}
