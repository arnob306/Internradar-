import type { Envelope } from "@internradar/domain";
import { describe, expect, it, vi } from "vitest";
import type { ProgramsQuery } from "../../features/programs/programs-query";
import { createProgramsHandler, type PublicProgram } from "./programs-handler";
import type { RequestLimiter } from "../request-limiter";
import type { ProgramListItem, ProgramsPage } from "./list-programs";

// 2026-10-03 14:00 UTC is already 4 October in Melbourne.
const NOW = new Date("2026-10-03T14:00:00Z");

function item(name: string): ProgramListItem {
  return {
    id: "7f0e6a3e-0000-4000-8000-000000000001",
    slug: "graduate-program",
    name,
    programType: "graduate",
    cities: ["melbourne"],
    disciplines: [],
    sourceUrl: "https://careers.example.com.au/graduates",
    company: { slug: "example-co", name: "Example Co", careersUrl: "https://careers.example.com.au" },
    status: "open",
    windows: [],
    eligibilityRules: { schemaVersion: 1, citizenship: { allowed: ["au_citizen"] } },
    rulesVerified: true,
    rulesVersion: 1,
  };
}

const allow: RequestLimiter = () => ({ allowed: true, retryAfterSeconds: 0 });

function setup(page: ProgramsPage = { items: [item("Graduate Program")], total: 1 }, allowed = true) {
  const list = vi.fn<(query: ProgramsQuery, today: string) => Promise<ProgramsPage>>(() =>
    Promise.resolve(page),
  );
  const limit = vi.fn<RequestLimiter>(() => ({ allowed, retryAfterSeconds: 42 }));
  const handler = createProgramsHandler({ list, now: () => NOW, limit });
  return { list, limit, handler };
}

async function call(handler: ReturnType<typeof setup>["handler"], query = "") {
  const response = await handler(new Request(`https://internradar.example/api/v1/programs${query}`));
  return { response, body: (await response.json()) as Envelope<PublicProgram[]> };
}

describe("GET /api/v1/programs", () => {
  it("answers 200 with the envelope and paging meta", async () => {
    const { handler } = setup({ items: [item("A"), item("B")], total: 42 });

    const { response, body } = await call(handler, "?limit=2&offset=4");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body.success).toBe(true);
    expect(body.error).toBeNull();
    expect(body.meta).toEqual({ total: 42, page: 3, limit: 2 });
    expect(body.success && body.data.map((program) => program.name)).toEqual(["A", "B"]);
  });

  it("rejects bad input with 400 and a field error for each problem, without querying", async () => {
    const { handler, list } = setup();

    const { response, body } = await call(handler, "?limit=0&offset=-1&sort=name");

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(!body.success && body.error.code).toBe("VALIDATION_ERROR");
    expect(!body.success && body.error.fields?.map((error) => error.field).sort()).toEqual([
      "limit",
      "offset",
      "sort",
    ]);
    expect(list).not.toHaveBeenCalled();
  });

  it("passes the parsed query and today's Melbourne date to the data layer", async () => {
    const { handler, list } = setup();

    await call(handler, "?type=graduate&discipline=physics&openNow=true&limit=5");

    expect(list).toHaveBeenCalledWith(
      { limit: 5, offset: 0, type: "graduate", discipline: "physics", openNow: true },
      "2026-10-04",
    );
  });

  it("exposes a public view of each program, never the raw eligibility rules", async () => {
    const { handler } = setup();

    const { body } = await call(handler);

    const [program] = body.success ? body.data : [];
    expect(Object.keys(program ?? {}).sort()).toEqual([
      "cities",
      "company",
      "disciplines",
      "id",
      "name",
      "programType",
      "rulesVerified",
      "slug",
      "sourceUrl",
      "status",
      "windows",
    ]);
  });

  it("lets a CDN cache a good answer briefly, and never an error", async () => {
    const ok = await call(setup().handler);
    const bad = await call(setup().handler, "?limit=0");

    expect(ok.response.headers.get("cache-control")).toBe(
      "public, s-maxage=60, stale-while-revalidate=300",
    );
    expect(bad.response.headers.get("cache-control")).toBe("no-store");
  });

  it("asks the limiter about this request before doing anything else", async () => {
    const { limit, handler } = setup();
    const request = new Request("https://internradar.example/api/v1/programs", { headers: { "x-real-ip": "1.1.1.1" } });

    await handler(request);

    expect(limit).toHaveBeenCalledExactlyOnceWith(request);
  });

  it.each([
    ["a good query", ""],
    ["a bad query", "?limit=0"],
  ])("tells a client over the limit to wait, for %s, without validating or querying", async (_label, query) => {
    const { list, handler } = setup(undefined, false);

    const { response, body } = await call(handler, query);

    expect(response.status).toBe(429);
    expect(!body.success && body.error.code).toBe("RATE_LIMITED");
    expect(response.headers.get("retry-after")).toBe("42");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(list).not.toHaveBeenCalled();
  });

  it("records a failure on the server, so an outage is not silent", async () => {
    const failure = new Error("connection refused");
    const log = vi.fn();
    const handler = createProgramsHandler({
      list: () => Promise.reject(failure),
      now: () => NOW,
      limit: allow,
      log,
    });

    await call(handler);

    expect(log).toHaveBeenCalledExactlyOnceWith("api.programs.list", failure);
  });

  it("does not log a good answer or a visitor's mistake", async () => {
    const log = vi.fn();
    const handler = createProgramsHandler({
      list: () => Promise.resolve({ items: [], total: 0 }),
      now: () => NOW,
      limit: allow,
      log,
    });

    await call(handler);
    await call(handler, "?limit=0");

    expect(log).not.toHaveBeenCalled();
  });

  it("answers 500 without a stack trace, SQL or the underlying message", async () => {
    const list = vi.fn(() =>
      Promise.reject(new Error('relation "public.programs" does not exist: select * from programs')),
    );
    const handler = createProgramsHandler({ list, now: () => NOW, limit: allow });

    const { response, body } = await call(handler);
    const text = JSON.stringify(body);

    expect(response.status).toBe(500);
    expect(!body.success && body.error.code).toBe("INTERNAL_ERROR");
    expect(text).not.toMatch(/select|relation|programs|stack|at /i);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
