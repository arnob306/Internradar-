import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config";

const KEK = Buffer.alloc(32, 7).toString("base64");

function validEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_ANON_KEY: "anon-key-for-tests",
    RESUME_KEK_V1: KEK,
    ...overrides,
  };
}

describe("loadConfig", () => {
  it("parses a valid environment", () => {
    const config = loadConfig(validEnv());

    expect(config.supabaseUrl).toBe("http://127.0.0.1:54321");
    expect(config.supabaseAnonKey).toBe("anon-key-for-tests");
  });

  it("throws naming the missing variable when SUPABASE_URL is absent", () => {
    const env = validEnv({ SUPABASE_URL: undefined });

    expect(() => loadConfig(env)).toThrow(ConfigError);
    expect(() => loadConfig(env)).toThrow(/SUPABASE_URL/);
  });

  it("names every problem variable, not only the first", () => {
    const env = validEnv({ SUPABASE_URL: undefined, SUPABASE_ANON_KEY: "" });

    expect(() => loadConfig(env)).toThrow(/SUPABASE_URL.*SUPABASE_ANON_KEY|SUPABASE_ANON_KEY.*SUPABASE_URL/s);
  });

  it("rejects a resume key that is not 32 bytes of base64", () => {
    const env = validEnv({ RESUME_KEK_V1: Buffer.alloc(16).toString("base64") });

    expect(() => loadConfig(env)).toThrow(/RESUME_KEK_V1/);
  });

  it("rejects base64 whose final character is not canonical for 32 bytes", () => {
    // 'B' is not a valid last character: the 2 unused low bits must be zero.
    const nonCanonical = `${KEK.slice(0, 42)}B=`;
    const env = validEnv({ RESUME_KEK_V1: nonCanonical });

    expect(() => loadConfig(env)).toThrow(/RESUME_KEK_V1/);
  });

  it("never echoes a rejected secret value in the error message", () => {
    const badSecret = "definitely-not-base64-secret-value";
    const env = validEnv({ RESUME_KEK_V1: badSecret });

    let message = "";
    try {
      loadConfig(env);
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain("RESUME_KEK_V1");
    expect(message).not.toContain(badSecret);
  });
});

describe("secret handling", () => {
  it("keeps secrets out of JSON output", () => {
    const config = loadConfig(validEnv());

    expect(JSON.stringify(config)).not.toContain(KEK);
  });

  it("keeps secrets out of string conversion", () => {
    const config = loadConfig(validEnv());

    expect(String(config.resumeKek)).not.toContain(KEK);
    expect(`${config.resumeKek}`).toBe("[redacted]");
  });

  it("keeps secrets out of console inspection", () => {
    const config = loadConfig(validEnv());

    expect(inspect(config, { depth: 5 })).not.toContain(KEK);
  });

  it("gives the raw value only through reveal()", () => {
    const config = loadConfig(validEnv());

    expect(config.resumeKek.reveal()).toBe(KEK);
  });
});
