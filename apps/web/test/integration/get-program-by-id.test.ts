import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getProgramById } from "../../src/server/programs/list-programs";
import { anonClient, cleanTestData, insertProgram, TEST_PREFIX, withAdmin } from "./helpers";

const TODAY = "2026-10-03";

beforeEach(() => withAdmin(cleanTestData));
afterEach(() => withAdmin(cleanTestData));

describe("getProgramById (as the anonymous role, through row-level security)", () => {
  it("returns the published program with its company and windows", async () => {
    const id = await withAdmin((db) =>
      insertProgram(db, {
        company: "acme",
        companyName: "Acme Co",
        slug: "grad",
        name: "Acme Graduate Program",
        windows: [{ cycleYear: 2027, status: "upcoming", opensOn: "2027-02-01", opensPrecision: "month" }],
      }),
    );

    const program = await getProgramById(anonClient(), id, TODAY);

    expect(program?.id).toBe(id);
    expect(program?.name).toBe("Acme Graduate Program");
    expect(program?.company).toMatchObject({ slug: `${TEST_PREFIX}acme`, name: "Acme Co" });
    expect(program?.windows.map((window) => window.cycleYear)).toEqual([2027]);
  });

  it("returns null for a program that is not published, as if it did not exist", async () => {
    const id = await withAdmin((db) => insertProgram(db, { company: "draft", name: "Draft", published: false }));

    expect(await getProgramById(anonClient(), id, TODAY)).toBeNull();
  });

  it("returns null for an id nobody has", async () => {
    expect(await getProgramById(anonClient(), randomUUID(), TODAY)).toBeNull();
  });

  it("fails with only the database's code when the id is not a uuid", async () => {
    await expect(getProgramById(anonClient(), "not-a-uuid", TODAY)).rejects.toThrow(
      "fetching a program failed (22P02)",
    );
  });
});
