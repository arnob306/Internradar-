import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "./msw-server";

describe("network guard", () => {
  it("fails a test that makes an unmocked request, and msw is what blocks it", async () => {
    const error = await fetch("https://example.invalid/unmocked").then(
      () => null,
      (reason: unknown) => reason as Error & { cause?: unknown },
    );

    // A DNS failure would also reject, so check msw's own message.
    expect(error).not.toBeNull();
    expect(String(error?.cause)).toContain("[MSW]");
  });

  it("allows a request that has an explicit handler", async () => {
    server.use(http.get("https://example.invalid/mocked", () => HttpResponse.json({ ok: true })));

    const response = await fetch("https://example.invalid/mocked");

    expect(await response.json()).toEqual({ ok: true });
  });
});
