import type { Envelope } from "@internradar/domain";
import { describe, expect, it, vi } from "vitest";
import { createSignOutHandler } from "./sign-out-handler";

const SITE = "https://internradar.example";

function setup(failure?: Error) {
  const signOut = vi.fn(() => (failure === undefined ? Promise.resolve() : Promise.reject(failure)));
  const log = vi.fn();
  return { signOut, log, handler: createSignOutHandler({ signOut, log }) };
}

function post(headers: Record<string, string> = {}): Request {
  return new Request(`${SITE}/api/v1/auth/sign-out`, {
    method: "POST",
    headers: { origin: SITE, "content-type": "application/json", ...headers },
    body: "{}",
  });
}

describe("POST /api/v1/auth/sign-out", () => {
  it("signs the student out and answers 200, never cached", async () => {
    const { handler, signOut } = setup();

    const response = await handler(post());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(((await response.json()) as Envelope<{ signedOut: boolean }>).data).toEqual({ signedOut: true });
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("refuses a foreign origin with 403, so another site cannot sign a student out", async () => {
    const { handler, signOut } = setup();

    const response = await handler(post({ origin: "https://evil.example" }));

    expect(response.status).toBe(403);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("refuses a form post with 415, which is also how a cross-site form would arrive", async () => {
    const { handler, signOut } = setup();

    const response = await handler(post({ "content-type": "application/x-www-form-urlencoded" }));

    expect(response.status).toBe(415);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("answers 500 without details, and records a safe summary, if signing out fails", async () => {
    const failure = new Error("auth server at 10.0.0.5 refused");
    const { handler, log } = setup(failure);

    const response = await handler(post());

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toMatch(/10\.0\.0\.5|refused/);
    expect(log).toHaveBeenCalledExactlyOnceWith("auth.sign-out", failure);
  });
});
