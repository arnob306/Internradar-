const MAX_URL_LENGTH = 2048;
const MAX_SLUG_LENGTH = 80;

// The data policy never links to aggregators. The seed parser already refuses them, and this checks
// again where a link is actually drawn, in case a row reached the database some other way.
const AGGREGATORS = ["seek.com.au", "seek.com", "prosple.com", "gradconnection.com"] as const;

const SLUG = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;

function hasControlOrSpace(text: string): boolean {
  return [...text].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x20 || code === 0x7f;
  });
}

/**
 * The employer's page as a link we are willing to draw, or null. It comes from the database, so it
 * is not trusted: only a plain https address is allowed, with no credentials (`user:pass@host`
 * and `host@evil` tricks), no control characters, a sensible length, and never an aggregator.
 */
export function safeExternalUrl(url: unknown): string | null {
  if (typeof url !== "string" || url.length === 0 || url.length > MAX_URL_LENGTH || hasControlOrSpace(url)) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "" || parsed.hostname === "") {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (AGGREGATORS.some((aggregator) => host === aggregator || host.endsWith(`.${aggregator}`))) {
    return null;
  }
  return url;
}

/**
 * One segment of the program page's path as a plain slug, or null. The segment is percent-decoded
 * first, so an encoded slash or space is caught after decoding, and then it must be letters,
 * digits and single hyphens only. Anything else is a page that cannot exist, and is refused before
 * the database is asked.
 */
export function slugFromPath(segment: unknown): string | null {
  if (typeof segment !== "string") {
    return null;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return null;
  }
  return decoded.length > 0 && decoded.length <= MAX_SLUG_LENGTH && SLUG.test(decoded) ? decoded : null;
}
