import { describe, expect, it } from "vitest";
import { PUBLIC_API_MAX_REQUESTS, publicApiLimiter } from "./public-limiter";

describe("the public API limiter", () => {
  it("lets one client make 60 requests a minute and turns the 61st away, sharing the count across routes", () => {
    const request = new Request("https://internradar.example/api/v1/programs", { headers: { "x-real-ip": "198.51.100.77" } });

    const verdicts = Array.from({ length: PUBLIC_API_MAX_REQUESTS }, () => publicApiLimiter(request).allowed);

    expect(PUBLIC_API_MAX_REQUESTS).toBe(60);
    expect(verdicts.every(Boolean)).toBe(true);
    const next = publicApiLimiter(new Request("https://internradar.example/api/v1/programs/a/b", { headers: { "x-real-ip": "198.51.100.77" } }));
    expect(next.allowed).toBe(false);
    expect(next.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(next.retryAfterSeconds).toBeLessThanOrEqual(60);
  });
});
