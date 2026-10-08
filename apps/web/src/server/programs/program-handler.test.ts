import type { Envelope } from "@internradar/domain";
import { describe, expect, it, vi } from "vitest";
import type { ProgramListItem } from "./list-programs";
import { createProgramHandler } from "./program-handler";
import type { PublicProgram } from "./programs-handler";

// 2026-10-03 14:00 UTC is already 4 October in Melbourne.
const NOW = new Date("2026-10-03T14:00:00Z");

const found: ProgramListItem = {
  id: "7f0e6a3e-0000-4000-8000-000000000001",
  slug: "graduate-program",
  name: "Graduate Program",
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

type Get = (company: string, program: string, today: string) => Promise<ProgramListItem | null>;

function setup(result: ProgramListItem | null | Error = found) {
  const get = vi.fn<Get>(() => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)));
  const log = vi.fn<(scope: string, error: unknown) => void>();
  const handler = createProgramHandler({ get, now: () => NOW, log });
  return { get, log, handler };
}

async function call(handler: ReturnType<typeof setup>["handler"], company = "example-co", program = "graduate-program") {
  const response = await handler(new Request("https://internradar.example/api/v1/programs/x/y"), {
    params: Promise.resolve({ company, program }),
  });
  return { response, body: (await response.json()) as Envelope<PublicProgram> };
}

describe("GET /api/v1/programs/{company}/{program}", () => {
  it("answers with the program in the envelope, and looks it up by both slugs and today's Melbourne date", async () => {
    const { get, handler } = setup();

    const { response, body } = await call(handler);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data?.name).toBe("Graduate Program");
    expect(body.data?.company.slug).toBe("example-co");
    expect(get).toHaveBeenCalledExactlyOnceWith("example-co", "graduate-program", "2026-10-04");
  });

  it("keeps the raw eligibility rules on the server", async () => {
    const { response, body } = await call(setup().handler);

    expect(response.status).toBe(200);
    expect(JSON.stringify(body)).not.toContain("citizenship");
    expect(body.data).not.toHaveProperty("eligibilityRules");
  });

  it("lets a CDN hold a found program for a minute", async () => {
    const { response } = await call(setup().handler);

    expect(response.headers.get("cache-control")).toBe("public, s-maxage=60, stale-while-revalidate=300");
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
  });

  it("says 404 when there is no such published program, and never caches that", async () => {
    const { response, body } = await call(setup(null).handler);

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe("PROGRAM_NOT_FOUND");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each([
    ["an empty slug", ""],
    ["a leading hyphen", "-example"],
    ["a slash", "a%2Fb"],
    ["a malformed escape", "%E0%A4%A"],
    ["a path trick", ".."],
    ["a very long slug", "a".repeat(300)],
  ])("answers a slug with %s as not found, without asking the database", async (_label, bad) => {
    const first = setup();
    const { response } = await call(first.handler, bad, "graduate-program");
    expect(response.status).toBe(404);

    const second = setup();
    const again = await call(second.handler, "example-co", bad);
    expect(again.response.status).toBe(404);

    expect(first.get).not.toHaveBeenCalled();
    expect(second.get).not.toHaveBeenCalled();
  });

  it("gives a generic answer and logs only a safe summary when the lookup fails", async () => {
    const { handler, log } = setup(new Error("relation programs password=hunter2"));

    const { response, body } = await call(handler);

    expect(response.status).toBe(500);
    expect(body.error?.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toMatch(/hunter2|relation/);
    expect(log).toHaveBeenCalledWith("api.program.get", expect.any(Error));
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
