import type { ErrorEnvelope } from "@internradar/domain";
import { describe, expect, it } from "vitest";
import { guardMutation } from "./guard-mutation";

const SITE = "https://internradar.example";

function request(headers: Record<string, string>, method = "PUT"): Request {
  return new Request(`${SITE}/api/v1/me/profile`, { method, headers, body: "{}" });
}

async function body(response: Response | null): Promise<ErrorEnvelope> {
  return (await (response as Response).json()) as ErrorEnvelope;
}

describe("guardMutation: the checks every state-changing route makes first", () => {
  it("lets a same-origin JSON request through", () => {
    expect(guardMutation(request({ origin: SITE, "content-type": "application/json" }))).toBeNull();
  });

  it("accepts a JSON content type with a charset", () => {
    expect(guardMutation(request({ origin: SITE, "content-type": "application/json; charset=utf-8" }))).toBeNull();
  });

  it("lets a non-browser client through when it sends no Origin, but still wants JSON", () => {
    expect(guardMutation(request({ "content-type": "application/json" }))).toBeNull();
    expect(guardMutation(request({}))?.status).toBe(415);
  });

  it.each([
    ["another site", "https://evil.example"],
    ["a look-alike host", "https://internradar.example.evil.example"],
    ["the same host on another scheme", "http://internradar.example"],
    ["the same host on another port", "https://internradar.example:8443"],
    ["a sandboxed page, which sends the string null", "null"],
  ])("refuses a request that comes from %s with 403", async (_name, origin) => {
    const response = guardMutation(request({ origin, "content-type": "application/json" }));

    expect(response?.status).toBe(403);
    expect((await body(response)).error.code).toBe("FORBIDDEN_ORIGIN");
    expect(response?.headers.get("cache-control")).toBe("no-store");
  });

  it.each([
    "text/plain",
    "application/x-www-form-urlencoded",
    "multipart/form-data; boundary=x",
    "application/jsonp",
    "text/json",
  ])("refuses the content type %s with 415, which also stops cross-site form posts", async (type) => {
    const response = guardMutation(request({ origin: SITE, "content-type": type }));

    expect(response?.status).toBe(415);
    expect((await body(response)).error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("checks the origin before the content type", () => {
    const response = guardMutation(request({ origin: "https://evil.example", "content-type": "text/plain" }));

    expect(response?.status).toBe(403);
  });

  it("answers in the project's error envelope, never with details", async () => {
    const envelope = await body(guardMutation(request({ origin: "https://evil.example", "content-type": "application/json" })));

    expect(envelope).toEqual({
      success: false,
      data: null,
      error: { code: "FORBIDDEN_ORIGIN", message: "This request did not come from this site." },
      meta: null,
    });
  });
});
