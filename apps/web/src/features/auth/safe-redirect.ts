const MAX_LENGTH = 512;

/**
 * Where to send someone after they sign in, taken from a `next` query parameter an attacker can
 * write. Only a plain on-site path is allowed. Anything that could be read as another site is
 * refused, because a redirect to a look-alike page right after sign-in is a phishing gift.
 *
 * The tricks it closes: absolute and `javascript:` URLs, `//host` and `/\host` (browsers read
 * both as another site), a tab or newline slipped between the slashes (browsers strip them,
 * turning `/\t/host` into `//host`), and percent-encoded slashes that something downstream may
 * decode. Strict on purpose: our own links never need any of these.
 */
export function safeNextPath(input: unknown, fallback = "/profile"): string {
  if (typeof input !== "string" || input.length === 0 || input.length > MAX_LENGTH) {
    return fallback;
  }
  if (!input.startsWith("/") || input.startsWith("//")) {
    return fallback;
  }

  for (const character of input) {
    const code = character.charCodeAt(0);
    // Control characters, whitespace and backslashes: never legitimate in a path we link to.
    if (code <= 0x20 || code === 0x7f || character === "\\") {
      return fallback;
    }
  }

  const path = input.split(/[?#]/, 1)[0] ?? "";
  if (/%(2f|5c)/i.test(path)) {
    return fallback;
  }

  return input;
}
