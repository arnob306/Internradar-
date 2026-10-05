import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProfileInput } from "../../src/features/profile/profile-input";
import { loadProfile, saveProfile } from "../../src/server/profile/profile-repo";
import { anonClient, cleanTestUsers, signedInUser, withAdmin } from "./helpers";

const INPUT: ProfileInput = {
  expectedGraduation: { year: 2027, month: 6 },
  degreeLevel: "undergraduate",
  disciplines: ["computer_science", "mathematics_statistics"],
  isDoubleDegree: true,
  planningHonours: true,
  citizenship: "au_citizen",
  university: "University of Melbourne",
  emailAlerts: false,
};

beforeEach(() => withAdmin(cleanTestUsers));
afterEach(() => withAdmin(cleanTestUsers));

async function rowsFor(userId: string): Promise<Record<string, unknown>[]> {
  return withAdmin(async (db) => (await db.query("select * from public.profiles where user_id = $1", [userId])).rows);
}

describe("the profile, through row-level security, as real signed-in users", () => {
  it("is empty for someone who has not saved one", async () => {
    const { client } = await signedInUser();

    expect(await loadProfile(client)).toBeNull();
  });

  it("saves a profile and reads the same thing back", async () => {
    const { client, userId } = await signedInUser();

    await saveProfile(client, userId, INPUT);

    expect(await loadProfile(client)).toEqual(INPUT);
  });

  it("stores the graduation month as the first of the month", async () => {
    const { client, userId } = await signedInUser();

    await saveProfile(client, userId, INPUT);

    // Ask Postgres for the date as text: the driver would turn it into a JavaScript Date at local
    // midnight, and converting that to UTC shifts it a day in Melbourne.
    const stored = await withAdmin(
      async (db) =>
        (
          await db.query<{ day: string }>(
            "select to_char(expected_graduation, 'YYYY-MM-DD') as day from public.profiles where user_id = $1",
            [userId],
          )
        ).rows[0]?.day,
    );
    expect(stored).toBe("2027-06-01");
  });

  it("saving again replaces the profile in place: still one row, with the new values", async () => {
    const { client, userId } = await signedInUser();
    await saveProfile(client, userId, INPUT);

    await saveProfile(client, userId, { ...INPUT, degreeLevel: "honours", disciplines: ["law"], emailAlerts: true });

    expect(await rowsFor(userId)).toHaveLength(1);
    expect(await loadProfile(client)).toMatchObject({
      degreeLevel: "honours",
      disciplines: ["law"],
      emailAlerts: true,
    });
  });

  it("lets a student clear what they told us: saving an empty profile empties it", async () => {
    const { client, userId } = await signedInUser();
    await saveProfile(client, userId, INPUT);

    await saveProfile(client, userId, {
      expectedGraduation: null,
      degreeLevel: null,
      disciplines: [],
      isDoubleDegree: false,
      planningHonours: false,
      citizenship: null,
      university: null,
      emailAlerts: true,
    });

    expect(await loadProfile(client)).toMatchObject({ expectedGraduation: null, citizenship: null, disciplines: [] });
  });

  describe("one student can never see or change another's profile", () => {
    it("cannot read it: they see their own, or nothing", async () => {
      const alice = await signedInUser();
      const bob = await signedInUser();
      await saveProfile(alice.client, alice.userId, INPUT);

      expect(await loadProfile(bob.client)).toBeNull();
      expect(await loadProfile(alice.client)).toEqual(INPUT);
    });

    it("cannot write to it, even by naming her id: the save is refused and hers is untouched", async () => {
      const alice = await signedInUser();
      const bob = await signedInUser();
      await saveProfile(alice.client, alice.userId, INPUT);

      await expect(
        saveProfile(bob.client, alice.userId, { ...INPUT, citizenship: "other", university: "Hijacked" }),
      ).rejects.toThrow();

      expect(await loadProfile(alice.client)).toEqual(INPUT);
    });

    it("cannot take over her row by saving under his own id: they stay separate", async () => {
      const alice = await signedInUser();
      const bob = await signedInUser();
      await saveProfile(alice.client, alice.userId, INPUT);

      await saveProfile(bob.client, bob.userId, { ...INPUT, university: "Bob's University" });

      expect((await loadProfile(alice.client))?.university).toBe("University of Melbourne");
      expect((await loadProfile(bob.client))?.university).toBe("Bob's University");
    });
  });

  describe("a visitor with no account", () => {
    it("reads nothing", async () => {
      const alice = await signedInUser();
      await saveProfile(alice.client, alice.userId, INPUT);

      expect(await loadProfile(anonClient())).toBeNull();
    });

    it("cannot save anything", async () => {
      const alice = await signedInUser();

      await expect(saveProfile(anonClient(), alice.userId, INPUT)).rejects.toThrow();
      expect(await rowsFor(alice.userId)).toHaveLength(0);
    });
  });

  it("never throws a database message at the caller: a failure carries only an error code", async () => {
    const alice = await signedInUser();
    const bob = await signedInUser();

    const failure = await saveProfile(bob.client, alice.userId, INPUT).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).not.toMatch(/profiles|row-level|policy|violates/i);
  });

  it("drops what the app no longer recognises, so an odd stored value never blocks the page", async () => {
    const { client, userId } = await signedInUser();
    await saveProfile(client, userId, INPUT);
    await withAdmin((db) =>
      db.query("update public.profiles set disciplines = '{computer_science,retired_term}' where user_id = $1", [userId]),
    );

    expect((await loadProfile(client))?.disciplines).toEqual(["computer_science"]);
  });
});
