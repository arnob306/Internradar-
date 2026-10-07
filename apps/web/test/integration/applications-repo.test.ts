import { undoTarget } from "@internradar/domain";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ApplicationStoreError,
  findApplication,
  hasApplicationFor,
  latestChange,
  listApplications,
  removeApplication,
  saveApplication,
  updateApplication,
} from "../../src/server/applications/applications-repo";
import {
  cleanTestData,
  cleanTestUsers,
  insertProgram,
  signedInUser,
  TEST_PREFIX,
  withAdmin,
  type TestProgram,
} from "./helpers";

const TODAY = "2026-10-08";

// Applications point at programs with ON DELETE RESTRICT, so users (and their applications) go first.
const clean = () =>
  withAdmin(async (db) => {
    await cleanTestUsers(db);
    await cleanTestData(db);
  });

beforeEach(clean);
afterEach(clean);

async function newProgram(overrides: Partial<TestProgram> = {}): Promise<string> {
  return withAdmin((db) =>
    insertProgram(db, {
      company: "acme",
      companyName: "Acme Co",
      slug: "grad",
      name: "Acme Graduate Program",
      windows: [{ cycleYear: 2027, status: "upcoming", opensOn: "2027-02-01", opensPrecision: "month" }],
      ...overrides,
    }),
  );
}

describe("saving a program", () => {
  it("creates a saved application for the intake that is coming, naming the program and employer", async () => {
    const programId = await newProgram();
    const { client, userId } = await signedInUser();

    const saved = await saveApplication(client, userId, programId, TODAY);

    expect(saved?.created).toBe(true);
    expect(saved?.record).toMatchObject({
      programId,
      programSlug: "grad",
      programName: "Acme Graduate Program",
      companySlug: `${TEST_PREFIX}acme`,
      companyName: "Acme Co",
      cycleYear: 2027,
      status: "saved",
      appliedAt: null,
      notes: null,
      resumeId: null,
    });
  });

  it("links it to that intake's window", async () => {
    const programId = await newProgram();
    const { client, userId } = await signedInUser();

    const saved = await saveApplication(client, userId, programId, TODAY);

    const linked = await withAdmin(
      async (db) =>
        (
          await db.query<{ cycle_year: number }>(
            `select w.cycle_year from public.applications a
             join public.program_windows w on w.id = a.program_window_id where a.id = $1`,
            [saved?.record.id],
          )
        ).rows[0]?.cycle_year,
    );
    expect(linked).toBe(2027);
  });

  it("uses this year when the program has no window yet", async () => {
    const programId = await newProgram({ windows: [] });
    const { client, userId } = await signedInUser();

    expect((await saveApplication(client, userId, programId, TODAY))?.record.cycleYear).toBe(2026);
  });

  it("returns the application they already had, and says it is not new", async () => {
    const programId = await newProgram();
    const { client, userId } = await signedInUser();
    const first = await saveApplication(client, userId, programId, TODAY);

    const again = await saveApplication(client, userId, programId, TODAY);

    expect(again?.created).toBe(false);
    expect(again?.record.id).toBe(first?.record.id);
    expect(await listApplications(client)).toHaveLength(1);
  });

  it("is null for a program that is not published or does not exist", async () => {
    const draft = await newProgram({ company: "draft", published: false });
    const { client, userId } = await signedInUser();

    expect(await saveApplication(client, userId, draft, TODAY)).toBeNull();
    expect(await saveApplication(client, userId, randomUUID(), TODAY)).toBeNull();
  });

  it("cannot save on behalf of another student", async () => {
    const programId = await newProgram();
    const alice = await signedInUser();
    const bob = await signedInUser();

    await expect(saveApplication(alice.client, bob.userId, programId, TODAY)).rejects.toBeInstanceOf(
      ApplicationStoreError,
    );
  });
});

describe("whose applications they are", () => {
  it("shows a student only their own, newest change first", async () => {
    const one = await newProgram({ company: "one" });
    const two = await newProgram({ company: "two" });
    const alice = await signedInUser();
    const bob = await signedInUser();
    const first = await saveApplication(alice.client, alice.userId, one, TODAY);
    const second = await saveApplication(alice.client, alice.userId, two, TODAY);
    await saveApplication(bob.client, bob.userId, one, TODAY);

    const mine = await listApplications(alice.client);

    expect(mine.map((application) => application.id)).toEqual([second?.record.id, first?.record.id]);
    expect(await listApplications(bob.client)).toHaveLength(1);
  });

  it("will not find, change or remove someone else's application", async () => {
    const programId = await newProgram();
    const alice = await signedInUser();
    const bob = await signedInUser();
    const saved = await saveApplication(alice.client, alice.userId, programId, TODAY);
    const id = saved?.record.id ?? "";

    expect(await findApplication(bob.client, id)).toBeNull();
    expect(await updateApplication(bob.client, id, { notes: "hijacked" }, "saved")).toBeNull();
    expect(await removeApplication(bob.client, id)).toBe(false);
    expect((await findApplication(alice.client, id))?.notes).toBeNull();
  });
});

describe("changing an application", () => {
  async function savedApplication() {
    const programId = await newProgram();
    const user = await signedInUser();
    const saved = await saveApplication(user.client, user.userId, programId, TODAY);
    return { ...user, id: saved?.record.id ?? "" };
  }

  it("moves it forward and sets the applied date", async () => {
    const { client, id } = await savedApplication();

    const updated = await updateApplication(
      client,
      id,
      { status: "applied", appliedAt: "2026-10-08T01:00:00.000Z" },
      "saved",
    );

    expect(updated).toMatchObject({ status: "applied", appliedAt: expect.stringContaining("2026-10-08") });
  });

  it("changes nothing when the application is no longer in the status the student saw", async () => {
    const { client, id } = await savedApplication();
    await updateApplication(client, id, { status: "applied", appliedAt: "2026-10-08T01:00:00.000Z" }, "saved");

    const stale = await updateApplication(client, id, { notes: "late edit" }, "saved");

    expect(stale).toBeNull();
    expect((await findApplication(client, id))?.notes).toBeNull();
  });

  it("changes the notes alone", async () => {
    const { client, id } = await savedApplication();

    const updated = await updateApplication(client, id, { notes: "Phone screen Friday" }, "saved");

    expect(updated).toMatchObject({ status: "saved", notes: "Phone screen Friday" });
  });

  it("clears the notes with null", async () => {
    const { client, id } = await savedApplication();
    await updateApplication(client, id, { notes: "x" }, "saved");

    expect((await updateApplication(client, id, { notes: null }, "saved"))?.notes).toBeNull();
  });

  it("lets a student reject a program they only saved, with no applied date", async () => {
    const { client, id } = await savedApplication();

    expect(await updateApplication(client, id, { status: "rejected" }, "saved")).toMatchObject({
      status: "rejected",
      appliedAt: null,
    });
  });

  it("refuses a move the database does not allow, whatever the caller thinks", async () => {
    const { client, id } = await savedApplication();

    await expect(
      updateApplication(client, id, { status: "offer", appliedAt: "2026-10-08T01:00:00.000Z" }, "saved"),
    ).rejects.toMatchObject({ code: "23514" });
    expect((await findApplication(client, id))?.status).toBe("saved");
  });

  it("carries only the database's code in a failure, never its message", async () => {
    const { client, id } = await savedApplication();

    const failure = await updateApplication(client, id, { status: "interview" }, "saved").catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ApplicationStoreError);
    expect(String((failure as Error).message)).not.toContain("applications");
  });
});

describe("the history behind undo", () => {
  it("starts with the moment it was saved, which cannot be undone", async () => {
    const programId = await newProgram();
    const { client, userId } = await signedInUser();
    const saved = await saveApplication(client, userId, programId, TODAY);

    const change = await latestChange(client, saved?.record.id ?? "");

    expect(change).toEqual({ fromStatus: null, toStatus: "saved", isUndo: false });
    expect(undoTarget(change)).toBeNull();
  });

  it("reports the latest move, and undoing it is a recorded step back that cannot itself be undone", async () => {
    const programId = await newProgram();
    const { client, userId } = await signedInUser();
    const id = (await saveApplication(client, userId, programId, TODAY))?.record.id ?? "";
    await updateApplication(client, id, { status: "applied", appliedAt: "2026-10-08T01:00:00.000Z" }, "saved");

    const afterApplying = await latestChange(client, id);
    expect(afterApplying).toEqual({ fromStatus: "saved", toStatus: "applied", isUndo: false });

    const target = undoTarget(afterApplying);
    expect(target).toBe("saved");
    await updateApplication(client, id, { status: target ?? "saved" }, "applied");

    const afterUndo = await latestChange(client, id);
    expect(afterUndo).toEqual({ fromStatus: "applied", toStatus: "saved", isUndo: true });
    expect(undoTarget(afterUndo)).toBeNull();
  });

  it("is null for an application that is not theirs", async () => {
    const programId = await newProgram();
    const alice = await signedInUser();
    const bob = await signedInUser();
    const id = (await saveApplication(alice.client, alice.userId, programId, TODAY))?.record.id ?? "";

    expect(await latestChange(bob.client, id)).toBeNull();
  });
});

describe("removing an application", () => {
  it("deletes it and its history", async () => {
    const programId = await newProgram();
    const { client, userId } = await signedInUser();
    const id = (await saveApplication(client, userId, programId, TODAY))?.record.id ?? "";

    expect(await removeApplication(client, id)).toBe(true);

    expect(await findApplication(client, id)).toBeNull();
    const events = await withAdmin(
      async (db) => (await db.query("select 1 from public.application_events where application_id = $1", [id])).rowCount,
    );
    expect(events).toBe(0);
  });

  it("is false when there is nothing to remove", async () => {
    const { client } = await signedInUser();

    expect(await removeApplication(client, randomUUID())).toBe(false);
  });
});

describe("whether a program is already in the tracker", () => {
  it("is true once they saved it, and false before", async () => {
    const programId = await newProgram();
    const { client, userId } = await signedInUser();

    expect(await hasApplicationFor(client, programId)).toBe(false);
    await saveApplication(client, userId, programId, TODAY);
    expect(await hasApplicationFor(client, programId)).toBe(true);
  });

  it("is false for a program only someone else saved", async () => {
    const programId = await newProgram();
    const other = await signedInUser();
    await saveApplication(other.client, other.userId, programId, TODAY);
    const { client } = await signedInUser();

    expect(await hasApplicationFor(client, programId)).toBe(false);
  });
});
