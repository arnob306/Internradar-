import type { ProgramsQuery } from "../../src/features/programs/programs-query";
import { listPrograms } from "../../src/server/programs/list-programs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { anonClient, cleanTestData, insertProgram, TEST_PREFIX, withAdmin } from "./helpers";

const TODAY = "2026-10-03";

// Test programs are all `cadetship`, a type the seed catalog never uses, so filtering on it
// isolates them from any real programs that have been published into the local database.
function query(overrides: Partial<ProgramsQuery> = {}): ProgramsQuery {
  return {
    limit: 20,
    offset: 0,
    type: "cadetship",
    discipline: undefined,
    openNow: false,
    ...overrides,
  };
}

beforeEach(() => withAdmin(cleanTestData));
afterEach(() => withAdmin(cleanTestData));

describe("listPrograms (as the anonymous role, through row-level security)", () => {
  it("returns published programs and never an unpublished one", async () => {
    await withAdmin(async (db) => {
      await insertProgram(db, { company: "visible", name: "Visible Program" });
      await insertProgram(db, { company: "hidden", name: "Hidden Program", published: false });
    });

    const { items, total } = await listPrograms(anonClient(), query(), TODAY);

    expect(items.map((item) => item.name)).toEqual(["Visible Program"]);
    expect(total).toBe(1);
  });

  it("embeds the company and the windows, and exposes only the intended fields", async () => {
    await withAdmin(async (db) => {
      await insertProgram(db, {
        company: "acme",
        companyName: "Acme Co",
        name: "Acme Cadetship",
        disciplines: ["physics"],
        windows: [{ opensOn: "2026-08-12", closesOn: "2026-09-08", status: "closed" }],
      });
    });

    const { items } = await listPrograms(anonClient(), query(), TODAY);

    const [item] = items;
    expect(item?.company).toEqual({
      slug: `${TEST_PREFIX}acme`,
      name: "Acme Co",
      careersUrl: "https://careers.acme.example",
    });
    expect(item?.windows).toEqual([
      {
        cycleYear: 2027,
        windowSeq: 1,
        opensOn: "2026-08-12",
        opensPrecision: "day",
        closesOn: "2026-09-08",
        closesPrecision: "day",
        programStartsOn: null,
        programEndsOn: null,
        status: "closed",
        sourceUrl: "https://careers.acme.example/window",
      },
    ]);
    expect(Object.keys(item ?? {}).sort()).toEqual([
      "cities",
      "company",
      "disciplines",
      "eligibilityRules",
      "id",
      "name",
      "programType",
      "rulesVerified",
      "slug",
      "sourceUrl",
      "status",
      "windows",
    ]);
    expect(item?.rulesVerified).toBe(false);
  });

  it("carries each window's own program start and end dates, which year level is judged against", async () => {
    await withAdmin(async (db) => {
      await insertProgram(db, {
        company: "dated",
        name: "Dated Cadetship",
        windows: [{ programStartsOn: "2026-11-01", programEndsOn: "2027-02-01", status: "upcoming" }],
      });
    });

    const { items } = await listPrograms(anonClient(), query(), TODAY);

    expect(items[0]?.windows[0]).toMatchObject({
      programStartsOn: "2026-11-01",
      programEndsOn: "2027-02-01",
    });
  });

  it("filters by discipline", async () => {
    await withAdmin(async (db) => {
      await insertProgram(db, { company: "phys", name: "Physics One", disciplines: ["physics"] });
      await insertProgram(db, { company: "law", name: "Law One", disciplines: ["law"] });
      await insertProgram(db, { company: "any", name: "Any Degree One", disciplines: [] });
    });

    const { items } = await listPrograms(anonClient(), query({ discipline: "physics" }), TODAY);

    expect(items.map((item) => item.name)).toEqual(["Physics One"]);
  });

  it("filters by program type", async () => {
    await withAdmin(async (db) => {
      await insertProgram(db, { company: "cad", name: "A Cadetship", type: "cadetship" });
      await insertProgram(db, { company: "grad", name: "A Graduate Program", type: "graduate" });
    });

    const { items } = await listPrograms(anonClient(), query({ type: "graduate" }), TODAY);

    const names = items.map((item) => item.name);
    expect(names).toContain("A Graduate Program");
    expect(names).not.toContain("A Cadetship");
  });

  it("paginates and reports the total across all pages", async () => {
    await withAdmin(async (db) => {
      for (const name of ["a", "b", "c", "d", "e"]) {
        await insertProgram(db, { company: name, name: `Program ${name}` });
      }
    });
    const client = anonClient();

    const first = await listPrograms(client, query({ limit: 2, offset: 0 }), TODAY);
    const second = await listPrograms(client, query({ limit: 2, offset: 2 }), TODAY);
    const last = await listPrograms(client, query({ limit: 2, offset: 4 }), TODAY);
    const beyond = await listPrograms(client, query({ limit: 2, offset: 10 }), TODAY);

    expect(first.items.map((item) => item.name)).toEqual(["Program a", "Program b"]);
    expect(second.items.map((item) => item.name)).toEqual(["Program c", "Program d"]);
    expect(last.items.map((item) => item.name)).toEqual(["Program e"]);
    expect(beyond.items).toEqual([]);
    expect([first.total, second.total, last.total, beyond.total]).toEqual([5, 5, 5, 5]);
  });

  it("with openNow, keeps only programs that are open today (injected date)", async () => {
    await withAdmin(async (db) => {
      await insertProgram(db, {
        company: "open",
        name: "Open Now",
        windows: [{ opensOn: "2026-09-01", closesOn: "2026-10-31", status: "unknown" }],
      });
      await insertProgram(db, {
        company: "shut",
        name: "Already Closed",
        windows: [{ opensOn: "2026-08-12", closesOn: "2026-09-08", status: "open" }],
      });
      await insertProgram(db, { company: "dates", name: "No Dates", windows: [] });
    });

    const { items, total } = await listPrograms(anonClient(), query({ openNow: true }), TODAY);

    expect(items.map((item) => item.name)).toEqual(["Open Now"]);
    expect(total).toBe(1);
  });

  it("orders names the way a person reads them: 'Program 2' before 'Program 10'", async () => {
    await withAdmin(async (db) => {
      await insertProgram(db, { company: "same", slug: "p10", name: "Program 10" });
      await insertProgram(db, { company: "same", slug: "p2", name: "Program 2" });
      await insertProgram(db, { company: "same", slug: "p1", name: "program 1" });
    });

    const { items } = await listPrograms(anonClient(), query(), TODAY);

    expect(items.map((item) => item.name)).toEqual(["program 1", "Program 2", "Program 10"]);
  });

  it("lists open programs first, then upcoming, unknown and closed, then by name", async () => {
    await withAdmin(async (db) => {
      await insertProgram(db, { company: "z", name: "Zeta (closed)", windows: [{ status: "closed" }] });
      await insertProgram(db, { company: "y", name: "Yankee (unknown)", windows: [] });
      await insertProgram(db, { company: "x", name: "X-ray (upcoming)", windows: [{ status: "upcoming" }] });
      await insertProgram(db, { company: "w", name: "Whiskey (open)", windows: [{ status: "open" }] });
      await insertProgram(db, { company: "a", name: "Alpha (open)", windows: [{ status: "open" }] });
    });

    const { items } = await listPrograms(anonClient(), query(), TODAY);

    expect(items.map((item) => item.name)).toEqual([
      "Alpha (open)",
      "Whiskey (open)",
      "X-ray (upcoming)",
      "Yankee (unknown)",
      "Zeta (closed)",
    ]);
    expect(items.map((item) => item.status)).toEqual([
      "open",
      "open",
      "upcoming",
      "unknown",
      "closed",
    ]);
  });
});
