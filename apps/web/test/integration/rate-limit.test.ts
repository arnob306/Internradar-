import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withinLimit } from "../../src/server/rate-limit";
import { anonClient, cleanTestUsers, signedInUser, withAdmin } from "./helpers";

beforeEach(() => withAdmin(cleanTestUsers));
afterEach(() => withAdmin(cleanTestUsers));

const HOUR = "1 hour";

describe("withinLimit, through the real rate_limit_hit function", () => {
  it("allows up to the limit and refuses the call after it", async () => {
    const { client } = await signedInUser();

    const results = [];
    for (let call = 0; call < 4; call++) {
      results.push(await withinLimit(client, "profile", 3, HOUR));
    }

    expect(results).toEqual([true, true, true, false]);
  });

  it("counts each student separately: one student's habit never blocks another", async () => {
    const heavy = await signedInUser();
    const light = await signedInUser();
    for (let call = 0; call < 5; call++) {
      await withinLimit(heavy.client, "profile", 2, HOUR);
    }

    expect(await withinLimit(heavy.client, "profile", 2, HOUR)).toBe(false);
    expect(await withinLimit(light.client, "profile", 2, HOUR)).toBe(true);
  });

  it("counts each bucket separately, so saving a profile does not use up feedback's budget", async () => {
    const { client } = await signedInUser();
    for (let call = 0; call < 3; call++) {
      await withinLimit(client, "profile", 2, HOUR);
    }

    expect(await withinLimit(client, "profile", 2, HOUR)).toBe(false);
    expect(await withinLimit(client, "feedback", 2, HOUR)).toBe(true);
  });

  it("has its own bucket for the tracker, so changing applications never uses up the profile's budget", async () => {
    const { client } = await signedInUser();
    for (let call = 0; call < 3; call++) {
      await withinLimit(client, "tracker", 2, HOUR);
    }

    expect(await withinLimit(client, "tracker", 2, HOUR)).toBe(false);
    expect(await withinLimit(client, "profile", 2, HOUR)).toBe(true);
  });

  it("is unavailable to a visitor: there is no one to count, so it fails instead of allowing", async () => {
    await expect(withinLimit(anonClient(), "profile", 3, HOUR)).rejects.toThrow();
  });

  it("fails with only an error code, never the database's message", async () => {
    const failure = await withinLimit(anonClient(), "profile", 3, HOUR).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).not.toMatch(/rate_limit_hit|function|permission|authentication/i);
  });
});
