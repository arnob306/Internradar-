import { createRequestLimiter } from "../request-limiter";

/** What one client may ask of the public program API: 60 requests a minute across both routes. */
export const PUBLIC_API_MAX_REQUESTS = 60;
export const PUBLIC_API_WINDOW_MS = 60_000;

// One instance for the whole server, so the list and the single-program route count together.
export const publicApiLimiter = createRequestLimiter({
  max: PUBLIC_API_MAX_REQUESTS,
  windowMs: PUBLIC_API_WINDOW_MS,
  now: () => Date.now(),
});
