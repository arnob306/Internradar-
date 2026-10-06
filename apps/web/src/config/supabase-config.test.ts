import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { ConfigError } from "./config";
import { loadSupabaseConfig } from "./supabase-config";

const SECRET_LOOKING_KEY = "anon-key-should-never-appear-in-an-error";

function env(overrides: Record<string, string | undefined> = {}) {
  return {
    SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_ANON_KEY: SECRET_LOOKING_KEY,
    ...overrides,
  };
}

describe("loadSupabaseConfig", () => {
  it("reads the URL and the anon key", () => {
    expect(loadSupabaseConfig(env())).toEqual({
      supabaseUrl: "http://127.0.0.1:54321",
      supabaseAnonKey: SECRET_LOOKING_KEY,
    });
  });

  it("does not need the resume encryption key, which a public page must never hold", () => {
    expect(() => loadSupabaseConfig(env())).not.toThrow();
    expect(Object.keys(loadSupabaseConfig(env({ RESUME_KEK_V1: "x" }))).sort()).toEqual([
      "supabaseAnonKey",
      "supabaseUrl",
    ]);
  });

  it("names every missing variable in a ConfigError", () => {
    const bad = env({ SUPABASE_URL: undefined, SUPABASE_ANON_KEY: "" });

    expect(() => loadSupabaseConfig(bad)).toThrow(ConfigError);
    expect(() => loadSupabaseConfig(bad)).toThrow(/SUPABASE_URL/);
    expect(() => loadSupabaseConfig(bad)).toThrow(/SUPABASE_ANON_KEY/);
  });

  it("rejects a URL that is not a URL, without echoing the value", () => {
    const bad = env({ SUPABASE_URL: "not a url" });

    expect(() => loadSupabaseConfig(bad)).toThrow(/SUPABASE_URL/);
    expect(() => loadSupabaseConfig(bad)).not.toThrow(/not a url/);
  });

  it("never puts the anon key in an error", () => {
    let message = "";
    try {
      loadSupabaseConfig(env({ SUPABASE_URL: "nope" }));
    } catch (error) {
      message = inspect(error);
    }

    expect(message).not.toContain(SECRET_LOOKING_KEY);
  });
});
