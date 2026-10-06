import { describe, expect, it } from "vitest";
import { loginRedirectFor } from "./protected-paths";

describe("loginRedirectFor: pages that need a signed-in student", () => {
  it.each(["/profile", "/profile/edit", "/tracker", "/tracker/abc"])(
    "sends a visitor on %s to sign-in, remembering where they were going",
    (path) => {
      expect(loginRedirectFor(path, "", false)).toBe(`/login?next=${encodeURIComponent(path)}`);
    },
  );

  it("keeps the query string in the remembered destination", () => {
    expect(loginRedirectFor("/tracker", "?tab=applied", false)).toBe(
      `/login?next=${encodeURIComponent("/tracker?tab=applied")}`,
    );
  });

  it.each(["/profile", "/tracker"])("lets a signed-in student through to %s", (path) => {
    expect(loginRedirectFor(path, "", true)).toBeNull();
  });

  it.each(["/", "/login", "/auth/callback", "/programs/ey-australia/graduate-program", "/api/v1/programs"])(
    "leaves the public page %s alone for a visitor",
    (path) => {
      expect(loginRedirectFor(path, "", false)).toBeNull();
    },
  );

  it("does not treat look-alike paths as protected", () => {
    expect(loginRedirectFor("/profiles", "", false)).toBeNull();
    expect(loginRedirectFor("/profile-help", "", false)).toBeNull();
  });

  it("only ever remembers an on-site path, whatever the query says", () => {
    const target = loginRedirectFor("/profile", "?next=https://evil.example", false) ?? "";

    expect(decodeURIComponent(target.slice("/login?next=".length)).startsWith("/profile")).toBe(true);
  });
});
