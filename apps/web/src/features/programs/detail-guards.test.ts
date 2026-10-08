import { describe, expect, it } from "vitest";
import { safeExternalUrl, slugFromPath } from "./detail-guards";

describe("safeExternalUrl: the employer link, taken from the database", () => {
  it.each([
    "https://www.ey.com/en_au/careers/2027-graduate-program-student-opportunities",
    "https://careers.example.com.au/graduates?stage=2#apply",
    "https://jobs-au.pwc.com/au/en/graduate-program",
  ])("allows the ordinary https page %s unchanged", (url) => {
    expect(safeExternalUrl(url)).toBe(url);
  });

  it.each([
    ["plain http", "http://careers.example.com"],
    ["a javascript: link", "javascript:alert(1)"],
    ["a data: link", "data:text/html,<script>alert(1)</script>"],
    ["a file: link", "file:///etc/passwd"],
    ["a protocol-relative link", "//evil.example"],
    ["a relative path", "/careers"],
    ["a link with a password in it", "https://user:secret@careers.example.com"],
    ["a link with a username in it", "https://careers.example.com@evil.example/"],
    ["an empty string", ""],
    ["whitespace", "   "],
    ["text that is not a URL", "not a url"],
    ["a link with a newline", "https://careers.example.com/\nattacker"],
    ["an over-long link", `https://careers.example.com/${"a".repeat(2100)}`],
  ])("refuses %s", (_name, url) => {
    expect(safeExternalUrl(url)).toBeNull();
  });

  it.each([
    "https://www.seek.com.au/graduate-jobs",
    "https://seek.com/jobs",
    "https://au.prosple.com/graduate-employers/x",
    "https://gradconnection.com/employers/x",
    "https://au.gradconnection.com/x",
  ])("refuses the aggregator %s, which the data policy never links to", (url) => {
    expect(safeExternalUrl(url)).toBeNull();
  });

  it("does not mistake a similar-looking employer host for an aggregator", () => {
    expect(safeExternalUrl("https://notseek.com.au/careers")).toBe("https://notseek.com.au/careers");
  });

  it("refuses a value that is not a string", () => {
    expect(safeExternalUrl(null)).toBeNull();
    expect(safeExternalUrl(undefined)).toBeNull();
    expect(safeExternalUrl(42 as unknown as string)).toBeNull();
  });
});

describe("slugFromPath: the two segments of /programs/<employer>/<program>", () => {
  it.each(["ey-australia", "graduate-program", "nab", "a1", "Deloitte-Australia"])(
    "accepts the slug %s",
    (slug) => {
      expect(slugFromPath(slug)).toBe(slug);
    },
  );

  it("decodes a percent-encoded segment before checking it", () => {
    expect(slugFromPath("ey%2Daustralia")).toBe("ey-australia");
  });

  it.each([
    ["an empty segment", ""],
    ["a path traversal", ".."],
    ["a slash smuggled in by encoding", "a%2Fb"],
    ["a backslash", "a%5Cb"],
    ["a space", "a%20b"],
    ["a query character", "a%3Fb"],
    ["a null byte", "a%00"],
    ["a leading hyphen", "-abc"],
    ["a trailing hyphen", "abc-"],
    ["a double hyphen", "a--b"],
    ["an underscore", "a_b"],
    ["a dot", "a.b"],
    ["unicode", "caf%C3%A9"],
    ["a broken percent sequence", "%E0%A4%A"],
    ["a too-long slug", "a".repeat(81)],
    ["SQL-looking text", "x%27%3B%20drop%20table"],
  ])("refuses %s", (_name, segment) => {
    expect(slugFromPath(segment)).toBeNull();
  });

  it("accepts the longest allowed slug", () => {
    expect(slugFromPath("a".repeat(80))).toBe("a".repeat(80));
  });

  it("refuses a value that is not a string", () => {
    expect(slugFromPath(undefined)).toBeNull();
    expect(slugFromPath(["a", "b"])).toBeNull();
  });
});
