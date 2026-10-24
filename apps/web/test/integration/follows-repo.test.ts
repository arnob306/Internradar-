import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FollowStoreError,
  followProgram,
  isFollowing,
  unfollowProgram,
} from "../../src/server/follows/follows-repo";
import { withinLimit } from "../../src/server/rate-limit";
import {
  anonClient,
  cleanTestData,
  cleanTestUsers,
  insertProgram,
  signedInUser,
  withAdmin,
  type TestProgram,
} from "./helpers";

// Follows point at programs with ON DELETE CASCADE, but users go first so cleanup matches the others.
const clean = () =>
  withAdmin(async (db) => {
    await cleanTestUsers(db);
    await cleanTestData(db);
  });

beforeEach(clean);
afterEach(clean);

function newProgram(overrides: Partial<TestProgram> = {}): Promise<string> {
  return withAdmin((db) =>
    insertProgram(db, {
      company: "acme",
      slug: "grad",
      name: "Acme Graduate Program",
      windows: [{ cycleYear: 2027, status: "upcoming", opensOn: "2027-02-01", opensPrecision: "month" }],
      ...overrides,
    }),
  );
}

const followRows = (programId: string) =>
  withAdmin(async (db) =>
    (
      await db.query<{ user_id: string; notify: boolean }>(
        "select user_id, notify from public.program_follows where program_id = $1",
        [programId],
      )
    ).rows,
  );

describe("following a program", () => {
  it("records the follow for the signed-in student, with email on", async () => {
    const programId = await newProgram();
    const { client, userId } = await signedInUser();

    expect(await followProgram(client, userId, programId)).toBe(true);

    expect(await followRows(programId)).toEqual([{ user_id: userId, notify: true }]);
  });

  it("can be repeated without making a second follow", async () => {
    const programId = await newProgram();
    const { client, userId } = await signedInUser();

    await followProgram(client, userId, programId);
    expect(await followProgram(client, userId, programId)).toBe(true);

    expect(await followRows(programId)).toHaveLength(1);
  });

  it("says no, and writes nothing, for a program that is not published", async () => {
    const programId = await newProgram({ published: false });
    const { client, userId } = await signedInUser();

    expect(await followProgram(client, userId, programId)).toBe(false);

    expect(await followRows(programId)).toEqual([]);
  });

  it("says no for a program that does not exist", async () => {
    const { client, userId } = await signedInUser();
    expect(await followProgram(client, userId, "99999999-9999-4999-8999-999999999999")).toBe(false);
  });

  it("fails with only a database code, never its message, when the database refuses", async () => {
    const programId = await newProgram();
    const { userId } = await signedInUser();

    // A visitor has no session, so row-level security refuses the write.
    const failure = await followProgram(anonClient(), userId, programId).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(FollowStoreError);
    expect((failure as FollowStoreError).code).not.toBe("");
    expect((failure as FollowStoreError).message).not.toContain("program_follows");
  });
});

describe("unfollowing a program", () => {
  it("removes the follow", async () => {
    const programId = await newProgram();
    const { client, userId } = await signedInUser();
    await followProgram(client, userId, programId);

    await unfollowProgram(client, userId, programId);

    expect(await followRows(programId)).toEqual([]);
  });

  it("is fine for a program that was never followed", async () => {
    const programId = await newProgram();
    const { client, userId } = await signedInUser();
    await expect(unfollowProgram(client, userId, programId)).resolves.toBeUndefined();
  });

  it("never removes another student's follow", async () => {
    const programId = await newProgram();
    const owner = await signedInUser();
    const other = await signedInUser();
    await followProgram(owner.client, owner.userId, programId);

    // Even naming the owner, the other student's session cannot touch the row.
    await unfollowProgram(other.client, owner.userId, programId);

    expect(await followRows(programId)).toEqual([{ user_id: owner.userId, notify: true }]);
  });
});

describe("whether a student follows a program", () => {
  it("is true only for the student who follows it", async () => {
    const programId = await newProgram();
    const owner = await signedInUser();
    const other = await signedInUser();
    await followProgram(owner.client, owner.userId, programId);

    expect(await isFollowing(owner.client, programId)).toBe(true);
    expect(await isFollowing(other.client, programId)).toBe(false);
  });

  it("is false after unfollowing", async () => {
    const programId = await newProgram();
    const { client, userId } = await signedInUser();
    await followProgram(client, userId, programId);
    await unfollowProgram(client, userId, programId);

    expect(await isFollowing(client, programId)).toBe(false);
  });
});

describe("the follow allowance", () => {
  it("counts in its own bucket", async () => {
    const { client } = await signedInUser();
    expect(await withinLimit(client, "follow", 1, "1 hour")).toBe(true);
    expect(await withinLimit(client, "follow", 1, "1 hour")).toBe(false);
  });
});
