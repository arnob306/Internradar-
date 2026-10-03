import { describe, expect, it, vi } from "vitest";
import { createCallbackHandler } from "./callback-handler";

const SITE = "https://internradar.example";

function setup(exchange: (code: string) => Promise<boolean> = () => Promise.resolve(true)) {
  const spy = vi.fn(exchange);
  const log = vi.fn();
  return { exchange: spy, log, handler: createCallbackHandler({ exchange: spy, log }) };
}

function get(query: string): Request {
  return new Request(`${SITE}/auth/callback${query}`);
}

function where(response: Response): string | null {
  return response.headers.get("location");
}

describe("GET /auth/callback: the page the emailed link lands on", () => {
  it("signs the student in and sends them to the page they asked for", async () => {
    const { handler, exchange } = setup();

    const response = await handler(get("?code=abc123&next=%2Fprograms%2Fey-australia%2Fgraduate-program"));

    expect(exchange).toHaveBeenCalledExactlyOnceWith("abc123");
    expect(response.status).toBe(307);
    expect(where(response)).toBe(`${SITE}/programs/ey-australia/graduate-program`);
  });

  it("goes to the profile when no destination was given", async () => {
    const response = await setup().handler(get("?code=abc123"));

    expect(where(response)).toBe(`${SITE}/profile`);
  });

  it.each(["//evil.example", "https://evil.example/phish", "/\\evil.example", "javascript:alert(1)"])(
    "never redirects off the site, even for next=%s",
    async (next) => {
      const response = await setup().handler(get(`?code=abc123&next=${encodeURIComponent(next)}`));

      expect(where(response)).toBe(`${SITE}/profile`);
    },
  );

  it("sends a link with no code back to sign-in without trying anything", async () => {
    const { handler, exchange } = setup();

    const response = await handler(get(""));

    expect(exchange).not.toHaveBeenCalled();
    expect(where(response)).toBe(`${SITE}/login?error=invalid_link`);
  });

  it("sends an expired or already-used link back to sign-in with a calm reason", async () => {
    const response = await setup(() => Promise.resolve(false)).handler(get("?code=used-already"));

    expect(response.status).toBe(307);
    expect(where(response)).toBe(`${SITE}/login?error=invalid_link`);
  });

  it("treats a failure the same way, records it safely, and shows nothing of it to the student", async () => {
    const failure = new Error('database "internradar" unreachable at 10.0.0.5');
    const { handler, log } = setup(() => Promise.reject(failure));

    const response = await handler(get("?code=abc123"));

    expect(where(response)).toBe(`${SITE}/login?error=invalid_link`);
    expect(where(response)).not.toMatch(/database|10\.0\.0\.5/);
    expect(log).toHaveBeenCalledExactlyOnceWith("auth.callback", failure);
  });

  it("redirects relative to this request's own origin", async () => {
    const response = await setup().handler(new Request("https://other.example/auth/callback?code=x"));

    expect(where(response)?.startsWith("https://other.example/")).toBe(true);
  });

  it("is never cached, and carries no code in the redirect it sends", async () => {
    const response = await setup().handler(get("?code=secret-code-123"));

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(where(response)).not.toContain("secret-code-123");
  });

  it("ignores a code that is absurdly long", async () => {
    const { handler, exchange } = setup();

    const response = await handler(get(`?code=${"a".repeat(2000)}`));

    expect(exchange).not.toHaveBeenCalled();
    expect(where(response)).toBe(`${SITE}/login?error=invalid_link`);
  });
});
