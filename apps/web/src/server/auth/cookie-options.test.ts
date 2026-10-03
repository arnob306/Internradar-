import { describe, expect, it } from "vitest";
import { hardenCookie } from "./cookie-options";

describe("hardenCookie: the session cookie's attributes", () => {
  it("is httpOnly, SameSite=Lax and site-wide, whatever the auth library asks for", () => {
    const options = hardenCookie({ httpOnly: false, sameSite: "none", path: "/somewhere" }, true);

    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
  });

  it("applies the same attributes when the library asks for nothing", () => {
    expect(hardenCookie(undefined, false)).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
    });
  });

  it("is Secure in production and not in local development, where the site is plain http", () => {
    expect(hardenCookie({}, true).secure).toBe(true);
    expect(hardenCookie({ secure: true }, false).secure).toBe(false);
  });

  it("never sets a Domain, so the cookie belongs to this host alone and not its subdomains", () => {
    const options = hardenCookie({ domain: ".internradar.example" }, true);

    expect(options).not.toHaveProperty("domain");
  });

  it("keeps the lifetime the library chose, including the 0 that deletes a cookie", () => {
    expect(hardenCookie({ maxAge: 3600 }, true).maxAge).toBe(3600);
    expect(hardenCookie({ maxAge: 0 }, true).maxAge).toBe(0);
    const expires = new Date("2020-01-01T00:00:00Z");
    expect(hardenCookie({ expires }, true).expires).toBe(expires);
  });

  it("does not mutate the options it was given", () => {
    const given = { httpOnly: false, sameSite: "none" as const, domain: ".x.example" };

    hardenCookie(given, true);

    expect(given).toEqual({ httpOnly: false, sameSite: "none", domain: ".x.example" });
  });
});
