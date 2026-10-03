import { describe, expect, it } from "vitest";
import { ConfigError } from "../config/config";
import { createPublicClient } from "./public-client";

const ENV = { SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_ANON_KEY: "anon-key-for-tests" };

describe("createPublicClient", () => {
  it("builds a client from the Supabase URL and anon key", () => {
    const client = createPublicClient(ENV);

    expect(typeof client.from).toBe("function");
  });

  it("keeps no session: a visitor's client is stateless and anonymous", async () => {
    const client = createPublicClient(ENV);

    const { data } = await client.auth.getSession();

    expect(data.session).toBeNull();
  });

  it("throws a ConfigError when the environment is incomplete", () => {
    expect(() => createPublicClient({ SUPABASE_URL: ENV.SUPABASE_URL })).toThrow(ConfigError);
  });
});
