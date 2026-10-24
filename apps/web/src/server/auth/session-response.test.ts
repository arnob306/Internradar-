import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it } from "vitest";
import { respondWithSession, type PendingCookie } from "./session-response";

function request(cookie = ""): NextRequest {
  return new NextRequest("https://internradar.example/", { headers: cookie === "" ? {} : { cookie } });
}

const OPTIONS = { httpOnly: true, sameSite: "lax", secure: true, path: "/" } as const;

// Supabase splits a large session into several cookies, and writes them one after another.
const CHUNKS: PendingCookie[] = [
  { name: "sb-auth-token.0", value: "chunk-zero", options: OPTIONS },
  { name: "sb-auth-token.1", value: "chunk-one", options: OPTIONS },
  { name: "sb-auth-token.2", value: "chunk-two", options: OPTIONS },
];

describe("respondWithSession", () => {
  it("puts every refreshed cookie on the response, not only the last one", () => {
    const response = respondWithSession(request(), CHUNKS, {});

    expect(response.cookies.getAll().map((cookie) => cookie.name).sort()).toEqual([
      "sb-auth-token.0",
      "sb-auth-token.1",
      "sb-auth-token.2",
    ]);
  });

  it("keeps each cookie's value and its hardened attributes", () => {
    const response = respondWithSession(request(), CHUNKS, {});

    const chunk = response.cookies.get("sb-auth-token.1");
    expect(chunk?.value).toBe("chunk-one");
    expect(chunk).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true, path: "/" });
  });

  it("gives the rest of this same request the refreshed cookies too", () => {
    const incoming = request("sb-auth-token.0=stale; other=keep");

    respondWithSession(incoming, CHUNKS, {});

    expect(incoming.cookies.get("sb-auth-token.0")?.value).toBe("chunk-zero");
    expect(incoming.cookies.get("sb-auth-token.2")?.value).toBe("chunk-two");
    expect(incoming.cookies.get("other")?.value).toBe("keep");
  });

  it("puts the no-cache headers the auth library asks for on the response", () => {
    const response = respondWithSession(request(), CHUNKS, { "Cache-Control": "no-store", Pragma: "no-cache" });

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
  });

  it("changes nothing when there is nothing to refresh", () => {
    const response = respondWithSession(request(), [], {});

    expect(response.cookies.getAll()).toEqual([]);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("can carry the same cookies onto a redirect, which must not lose a refresh either", () => {
    const redirect = NextResponse.redirect("https://internradar.example/login");

    const response = respondWithSession(request(), CHUNKS, { "Cache-Control": "no-store" }, redirect);

    expect(response).toBe(redirect);
    expect(response.cookies.getAll()).toHaveLength(3);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("does not mutate the list it was given", () => {
    const given = [...CHUNKS];

    respondWithSession(request(), given, {});

    expect(given).toEqual(CHUNKS);
  });
});
