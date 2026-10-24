/**
 * Whether the site offers email alerts at all: the Follow button, and the email setting on the
 * profile. It stays off until alerts can really be sent (a hosted sender, a public link for the
 * unsubscribe page, and the alert command on a schedule), because the site must never promise
 * what it does not do. Only the exact value "true" turns it on, so a typo can never switch it on.
 */
export function alertsEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env["ALERTS_ENABLED"] === "true";
}
