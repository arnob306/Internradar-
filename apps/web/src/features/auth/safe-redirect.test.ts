import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-redirect";

const FALLBACK = "/profile";

describe("safeNextPath: where to send someone after they sign in", () => {
  it.each(["/", "/profile", "/programs/ey-australia/graduate-program", "/?type=graduate&openNow=true", "/profile#top"])(
    "keeps the on-site path %s as given",
    (path) => {
      expect(safeNextPath(path)).toBe(path);
    },
  );

  it.each([undefined, null, ""])("falls back when there is no destination (%j)", (input) => {
    expect(safeNextPath(input)).toBe(FALLBACK);
  });

  it("uses the fallback the caller gives", () => {
    expect(safeNextPath(null, "/")).toBe("/");
    expect(safeNextPath("https://evil.example", "/tracker")).toBe("/tracker");
  });

  // Each of these is a real open-redirect trick: it would send a freshly signed-in student to
  // a page the attacker controls, which then looks like part of the site.
  it.each([
    ["an absolute URL", "https://evil.example/phish"],
    ["a protocol-relative URL", "//evil.example"],
    ["a protocol-relative URL with a backslash", "/\\evil.example"],
    ["a backslash pair", "\\\\evil.example"],
    ["a path with no leading slash", "profile"],
    ["a javascript: URL", "javascript:alert(1)"],
    ["a data: URL", "data:text/html,<script>alert(1)</script>"],
    ["a tab hidden before the second slash", "/\t/evil.example"],
    ["a newline hidden before the second slash", "/\n/evil.example"],
    ["a carriage return", "/\r/evil.example"],
    ["a percent-encoded slash", "/%2F/evil.example"],
    ["a percent-encoded backslash", "/%5Cevil.example"],
    ["a lower-case percent-encoded slash", "/%2f/evil.example"],
    ["a space", "/ /evil.example"],
    ["a null byte", "/profile\u0000"],
    ["a very long path", `/${"a".repeat(600)}`],
    ["a non-string value", 42 as unknown as string],
  ])("never follows %s", (_name, input) => {
    expect(safeNextPath(input)).toBe(FALLBACK);
  });

  it("allows a long but reasonable path", () => {
    const path = `/${"a".repeat(400)}`;

    expect(safeNextPath(path)).toBe(path);
  });
});
