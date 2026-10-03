const MAX_ADDRESS = 254;
const MAX_LOCAL_PART = 64;
const DOMAIN_LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
// Characters that would make this a list, a display name or a quoted form rather than one address.
const FORBIDDEN_IN_LOCAL_PART = /[<>()[\]\\,;:"]/;

/**
 * One email address, normalised, or null. The address is typed into a public form and goes into
 * an email we send, so this is strict: no control characters (a newline here is how header
 * injection starts), no lists or display names, no stray dots, and RFC length limits.
 */
export function parseEmail(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }
  const email = input.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_ADDRESS) {
    return null;
  }
  for (const character of email) {
    const code = character.charCodeAt(0);
    if (code <= 0x20 || code === 0x7f) {
      return null;
    }
  }

  const parts = email.split("@");
  if (parts.length !== 2) {
    return null;
  }
  const [local = "", domain = ""] = parts;
  if (local.length === 0 || local.length > MAX_LOCAL_PART || FORBIDDEN_IN_LOCAL_PART.test(local)) {
    return null;
  }

  const labels = domain.split(".");
  // An empty label means a leading, trailing or doubled dot.
  if (labels.length < 2 || !labels.every((label) => DOMAIN_LABEL.test(label))) {
    return null;
  }
  return email;
}
