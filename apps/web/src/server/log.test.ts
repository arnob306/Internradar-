import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logFailure } from "./log";

let lines: string[];

beforeEach(() => {
  lines = [];
  vi.spyOn(console, "error").mockImplementation((line: unknown) => {
    lines.push(String(line));
  });
});
afterEach(() => vi.restoreAllMocks());

function logged(): Record<string, unknown> {
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
}

describe("logFailure", () => {
  it("writes one JSON line with the scope and the kind of error", () => {
    logFailure("programs.list", new TypeError("boom"));

    expect(logged()).toEqual({ level: "error", scope: "programs.list", error: "TypeError" });
  });

  it("includes a database error code when there is one, so an outage can be diagnosed", () => {
    const error = Object.assign(new Error("relation does not exist"), { code: "42P01" });

    logFailure("programs.list", error);

    expect(logged()).toEqual({
      level: "error",
      scope: "programs.list",
      error: "Error",
      code: "42P01",
    });
  });

  it("never writes the message, which can name tables, columns or connection details", () => {
    const secret = 'relation "public.programs" does not exist at postgres://u:p@host';

    logFailure("programs.list", new Error(secret));

    expect(lines.join("\n")).not.toContain("relation");
    expect(lines.join("\n")).not.toContain("postgres://");
  });

  it("never writes the stack trace", () => {
    logFailure("programs.list", new Error("boom"));

    expect(lines.join("\n")).not.toMatch(/\bat \S+ \(|\.ts:\d+|node_modules/);
  });

  it("handles things that are not Errors, without throwing or echoing them", () => {
    expect(() => logFailure("programs.list", "a string with secret-token-123")).not.toThrow();
    expect(logged()).toEqual({ level: "error", scope: "programs.list", error: "NonError" });
    expect(lines.join("\n")).not.toContain("secret-token-123");
  });

  it("ignores a code that is not a short string", () => {
    logFailure("programs.list", Object.assign(new Error("x"), { code: { nested: "object" } }));
    expect(logged()).not.toHaveProperty("code");
  });
});
