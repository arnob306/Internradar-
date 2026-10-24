/** The shape Next.js gives a page for its address parameters. */
export type PageSearchParams = Record<string, string | string[] | undefined>;

/** Next's page parameters as URLSearchParams, keeping repeats so a caller can notice and reject them. */
export function toSearchParams(raw: PageSearchParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) {
        params.append(key, item);
      }
    }
  }
  return params;
}
