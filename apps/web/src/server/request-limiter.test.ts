import { describe, expect, it } from "vitest";
import { clientKey, createRequestLimiter } from "./request-limiter";

const req = (headers: Record<string, string> = {}) => new Request("https://internradar.example/api/v1/programs", { headers });
const WINDOW = 60_000;

function setup(max = 3, maxClients = 100) {
  let now = 1_000_000;
  const limit = createRequestLimiter({ max, windowMs: WINDOW, now: () => now, maxClients });
  return { limit, advance: (ms: number) => (now += ms) };
}

describe("clientKey", () => {
  it("prefers the proxy's real-ip header", () => {
    expect(clientKey(req({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" }))).toBe("203.0.113.7");
  });

  it("falls back to the first address in x-forwarded-for, trimmed", () => {
    expect(clientKey(req({ "x-forwarded-for": " 198.51.100.1 , 10.0.0.1" }))).toBe("198.51.100.1");
  });

  it("shares one bucket among callers who send neither header, rather than letting them through", () => {
    expect(clientKey(req())).toBe("unknown");
    expect(clientKey(req({ "x-real-ip": "  " }))).toBe("unknown");
  });

  it("caps the key's length, so a huge header cannot be used to fill memory", () => {
    expect(clientKey(req({ "x-real-ip": "a".repeat(500) }))).toHaveLength(64);
  });
});

describe("createRequestLimiter", () => {
  it("allows a client up to the limit in a window and refuses the next request", () => {
    const { limit } = setup(3);
    const ip = req({ "x-real-ip": "1.1.1.1" });

    expect([limit(ip).allowed, limit(ip).allowed, limit(ip).allowed]).toEqual([true, true, true]);
    expect(limit(ip).allowed).toBe(false);
  });

  it("says how many seconds are left in the window, and never less than one", () => {
    const { limit, advance } = setup(1);
    const ip = req({ "x-real-ip": "1.1.1.1" });
    limit(ip);

    expect(limit(ip).retryAfterSeconds).toBe(60);
    advance(45_500);
    expect(limit(ip).retryAfterSeconds).toBe(15);
    advance(14_499);
    expect(limit(ip).retryAfterSeconds).toBe(1);
  });

  it("starts a fresh count when the window is over", () => {
    const { limit, advance } = setup(1);
    const ip = req({ "x-real-ip": "1.1.1.1" });
    limit(ip);
    expect(limit(ip).allowed).toBe(false);

    advance(WINDOW);

    expect(limit(ip).allowed).toBe(true);
  });

  it("counts each client separately", () => {
    const { limit } = setup(1);
    limit(req({ "x-real-ip": "1.1.1.1" }));

    expect(limit(req({ "x-real-ip": "1.1.1.1" })).allowed).toBe(false);
    expect(limit(req({ "x-real-ip": "2.2.2.2" })).allowed).toBe(true);
  });

  it("never remembers more clients than its cap: extra new clients share one overflow bucket", () => {
    const { limit } = setup(1, 3);
    for (const ip of ["1.1.1.1", "2.2.2.2", "3.3.3.3"]) {
      expect(limit(req({ "x-real-ip": ip })).allowed).toBe(true);
    }

    // The table is full of live clients, so these two are counted together.
    expect(limit(req({ "x-real-ip": "4.4.4.4" })).allowed).toBe(true);
    expect(limit(req({ "x-real-ip": "5.5.5.5" })).allowed).toBe(false);
    // Clients already known keep their own count.
    expect(limit(req({ "x-real-ip": "1.1.1.1" })).allowed).toBe(false);
  });

  it("forgets clients whose window is over before it refuses to remember a new one", () => {
    const { limit, advance } = setup(1, 2);
    limit(req({ "x-real-ip": "1.1.1.1" }));
    limit(req({ "x-real-ip": "2.2.2.2" }));

    advance(WINDOW);

    expect(limit(req({ "x-real-ip": "3.3.3.3" })).allowed).toBe(true);
    expect(limit(req({ "x-real-ip": "4.4.4.4" })).allowed).toBe(true);
    expect(limit(req({ "x-real-ip": "3.3.3.3" })).allowed).toBe(false);
  });
});
