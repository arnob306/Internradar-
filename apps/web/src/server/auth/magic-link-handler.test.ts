import type { Envelope } from "@internradar/domain";
import { describe, expect, it, vi } from "vitest";
import { createMagicLinkHandler, type SendLinkResult } from "./magic-link-handler";

const SITE = "https://internradar.example";

function setup(result: SendLinkResult | Error = "sent") {
  const sendLink = vi.fn<(email: string, redirectTo: string) => Promise<SendLinkResult>>(() =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
  );
  const log = vi.fn();
  return { sendLink, log, handler: createMagicLinkHandler({ sendLink, log }) };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${SITE}/api/v1/auth/magic-link`, {
    method: "POST",
    headers: { origin: SITE, "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function run(handler: (request: Request) => Promise<Response>, request: Request) {
  const response = await handler(request);
  return { response, body: (await response.json()) as Envelope<{ sent: boolean }> };
}

describe("POST /api/v1/auth/magic-link", () => {
  it("sends the link to the normalised address and answers 200", async () => {
    const { handler, sendLink } = setup();

    const { response, body } = await run(handler, post({ email: "  Student@Example.COM " }));

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, data: { sent: true }, error: null });
    expect(sendLink).toHaveBeenCalledExactlyOnceWith(
      "student@example.com",
      `${SITE}/auth/callback?next=%2Fprofile`,
    );
  });

  it("carries a safe next path through the link", async () => {
    const { handler, sendLink } = setup();

    await run(handler, post({ email: "a@example.com", next: "/programs/ey-australia/graduate-program" }));

    expect(sendLink.mock.calls[0]?.[1]).toBe(
      `${SITE}/auth/callback?next=%2Fprograms%2Fey-australia%2Fgraduate-program`,
    );
  });

  it.each(["//evil.example", "https://evil.example", "/\\evil.example", "javascript:alert(1)"])(
    "never puts the unsafe destination %s in the link",
    async (next) => {
      const { handler, sendLink } = setup();

      await run(handler, post({ email: "a@example.com", next }));

      expect(sendLink.mock.calls[0]?.[1]).toBe(`${SITE}/auth/callback?next=%2Fprofile`);
    },
  );

  it("builds the link from this request's own origin, never from the body or a header", async () => {
    const { handler, sendLink } = setup();

    await run(handler, post({ email: "a@example.com" }, { host: "evil.example", "x-forwarded-host": "evil.example" }));

    expect(sendLink.mock.calls[0]?.[1]?.startsWith(`${SITE}/`)).toBe(true);
  });

  it("answers the same way for every address, so it never reveals who has an account", async () => {
    const first = await run(setup().handler, post({ email: "known@example.com" }));
    const second = await run(setup().handler, post({ email: "never-seen@example.com" }));

    expect(second.response.status).toBe(first.response.status);
    expect(second.body).toEqual(first.body);
  });

  it("rejects an address that is not valid with 400 and a field error, sending nothing", async () => {
    const { handler, sendLink } = setup();

    const { response, body } = await run(handler, post({ email: "not-an-email" }));

    expect(response.status).toBe(400);
    expect(!body.success && body.error.code).toBe("VALIDATION_ERROR");
    expect(!body.success && body.error.fields?.map((field) => field.field)).toEqual(["email"]);
    expect(sendLink).not.toHaveBeenCalled();
  });

  it("rejects a header-injection attempt in the address", async () => {
    const { handler, sendLink } = setup();

    const { response } = await run(handler, post({ email: "a@example.com\nBcc: victim@example.com" }));

    expect(response.status).toBe(400);
    expect(sendLink).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid JSON", "{not json"],
    ["an array", "[]"],
    ["a string", '"a@example.com"'],
    ["null", "null"],
  ])("rejects a body that is %s with 400", async (_name, raw) => {
    const { handler, sendLink } = setup();

    const { response } = await run(handler, post(raw));

    expect(response.status).toBe(400);
    expect(sendLink).not.toHaveBeenCalled();
  });

  it("rejects unknown fields rather than ignoring them", async () => {
    const { handler, sendLink } = setup();

    const { response, body } = await run(handler, post({ email: "a@example.com", redirectTo: "https://evil.example" }));

    expect(response.status).toBe(400);
    expect(!body.success && body.error.fields?.map((field) => field.field)).toEqual(["redirectTo"]);
    expect(sendLink).not.toHaveBeenCalled();
  });

  it("rejects an oversized body", async () => {
    const { handler, sendLink } = setup();

    const { response } = await run(handler, post({ email: "a@example.com", next: `/${"a".repeat(5000)}` }));

    expect(response.status).toBe(400);
    expect(sendLink).not.toHaveBeenCalled();
  });

  it("refuses a foreign origin with 403 and a non-JSON request with 415, sending nothing", async () => {
    const { handler, sendLink } = setup();

    const foreign = await run(handler, post({ email: "a@example.com" }, { origin: "https://evil.example" }));
    const form = await run(handler, post("email=a@example.com", { "content-type": "application/x-www-form-urlencoded" }));

    expect(foreign.response.status).toBe(403);
    expect(form.response.status).toBe(415);
    expect(sendLink).not.toHaveBeenCalled();
  });

  it("answers 429 with a Retry-After when the auth service says too many emails were sent", async () => {
    const { handler } = setup("rate_limited");

    const { response, body } = await run(handler, post({ email: "a@example.com" }));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(!body.success && body.error.code).toBe("RATE_LIMITED");
  });

  it("answers 500 without leaking anything, and records the failure safely", async () => {
    const failure = new Error("smtp://user:password@mail.internal refused the message");
    const { handler, log } = setup(failure);

    const { response, body } = await run(handler, post({ email: "a@example.com" }));
    const text = JSON.stringify(body);

    expect(response.status).toBe(500);
    expect(!body.success && body.error.code).toBe("INTERNAL_ERROR");
    expect(text).not.toMatch(/smtp|password|mail\.internal/);
    expect(log).toHaveBeenCalledExactlyOnceWith("auth.magic-link", failure);
  });

  it("is never cached", async () => {
    const ok = await run(setup().handler, post({ email: "a@example.com" }));
    const bad = await run(setup().handler, post({ email: "x" }));

    expect(ok.response.headers.get("cache-control")).toBe("no-store");
    expect(bad.response.headers.get("cache-control")).toBe("no-store");
  });
});
