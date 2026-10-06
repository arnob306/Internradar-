import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getProgram } from "../../src/server/programs/list-programs";
import { anonClient, cleanTestData, insertProgram, TEST_PREFIX, withAdmin } from "./helpers";

const TODAY = "2026-10-03";
const company = (name: string) => `${TEST_PREFIX}${name}`;

beforeEach(() => withAdmin(cleanTestData));
afterEach(() => withAdmin(cleanTestData));

describe("getProgram (as the anonymous role, through row-level security)", () => {
  it("returns the published program, with its company and its windows, newest first", async () => {
    await withAdmin(async (db) => {
      await insertProgram(db, {
        company: "acme",
        companyName: "Acme Co",
        slug: "grad",
        name: "Acme Graduate Program",
        windows: [
          { cycleYear: 2026, status: "closed" },
          { cycleYear: 2027, status: "upcoming", opensOn: "2027-02-01", opensPrecision: "month" },
        ],
      });
    });

    const program = await getProgram(anonClient(), company("acme"), "grad", TODAY);

    expect(program?.name).toBe("Acme Graduate Program");
    expect(program?.company).toMatchObject({ slug: company("acme"), name: "Acme Co" });
    expect(program?.windows.map((window) => window.cycleYear)).toEqual([2027, 2026]);
    expect(program?.status).toBe("upcoming");
  });

  it("finds the right program when several employers use the same program slug", async () => {
    await withAdmin(async (db) => {
      await insertProgram(db, { company: "one", slug: "graduate-program", name: "One's Program" });
      await insertProgram(db, { company: "two", slug: "graduate-program", name: "Two's Program" });
    });

    const one = await getProgram(anonClient(), company("one"), "graduate-program", TODAY);
    const two = await getProgram(anonClient(), company("two"), "graduate-program", TODAY);

    expect([one?.name, two?.name]).toEqual(["One's Program", "Two's Program"]);
  });

  it.each([
    ["an unknown employer", () => [company("nobody"), "grad"] as const],
    ["an unknown program", () => [company("acme"), "nothing-here"] as const],
    ["the right program under the wrong employer", () => [company("other"), "grad"] as const],
  ])("returns null for %s", async (_name, args) => {
    await withAdmin(async (db) => {
      await insertProgram(db, { company: "acme", slug: "grad", name: "Acme Graduate Program" });
      await insertProgram(db, { company: "other", slug: "different", name: "Other Program" });
    });

    const [employer, program] = args();

    expect(await getProgram(anonClient(), employer, program, TODAY)).toBeNull();
  });

  it("never returns an unpublished program: row-level security hides it", async () => {
    await withAdmin(async (db) => {
      await insertProgram(db, { company: "secret", slug: "grad", name: "Draft Program", published: false });
    });

    expect(await getProgram(anonClient(), company("secret"), "grad", TODAY)).toBeNull();
  });

  it("matches slugs without regard to letter case, as the database column does", async () => {
    await withAdmin(async (db) => {
      await insertProgram(db, { company: "acme", slug: "grad", name: "Acme Graduate Program" });
    });

    expect((await getProgram(anonClient(), company("ACME"), "GRAD", TODAY))?.name).toBe("Acme Graduate Program");
  });

  it("carries what the eligibility check needs, and the verification state", async () => {
    await withAdmin(async (db) => {
      await insertProgram(db, { company: "acme", slug: "grad", name: "Acme Graduate Program" });
      await db.query(
        "update public.programs set eligibility_verified_at = now(), eligibility_rules_version = 2 where slug = 'grad' and company_id in (select id from public.companies where slug = $1)",
        [company("acme")],
      );
    });

    const program = await getProgram(anonClient(), company("acme"), "grad", TODAY);

    expect(program).toMatchObject({ rulesVerified: true, rulesVersion: 2 });
    expect(program?.eligibilityRules).toEqual({ schemaVersion: 1 });
  });
});
