import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DISCIPLINES } from "@internradar/domain";
import { parse } from "yaml";
import { describe, expect, it, vi } from "vitest";
import type { ApplicationStage } from "../../features/programs/application-stages";
import { slugFromPath } from "../../features/programs/detail-guards";
import { DEFAULT_LIMIT, MAX_LIMIT, parseProgramsQuery, PROGRAM_TYPES } from "../../features/programs/programs-query";
import type { ProgramListItem, ProgramsPage, ProgramWindowItem } from "./list-programs";
import { createProgramHandler } from "./program-handler";
import { createProgramsHandler, toPublicProgram } from "./programs-handler";
import { PUBLIC_API_MAX_REQUESTS, PUBLIC_API_WINDOW_MS } from "./public-limiter";
import type { RequestLimiter } from "../request-limiter";

// The written contract for the public program API. These tests hold it to what the handlers really do,
// so the file cannot drift: a field, an enum value, an error code or the rate limit changing in the code
// without the spec (or the other way round) fails here.

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Node = { [key: string]: Json };

const SPEC_PATH = fileURLToPath(new URL("../../../../../docs/api/openapi.yaml", import.meta.url));
const spec = parse(readFileSync(SPEC_PATH, "utf8")) as Node;

const asNode = (value: Json | undefined): Node => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("expected an object in the spec");
  }
  return value;
};

/** Follow a "$ref" like "#/components/schemas/Program" to the object it names. */
function resolve(value: Json | undefined): Node {
  const node = asNode(value);
  const ref = node["$ref"];
  if (typeof ref !== "string") {
    return node;
  }
  return ref
    .replace(/^#\//, "")
    .split("/")
    .reduce<Node>((current, key) => asNode(current[key]), spec);
}

const at = (...keys: string[]): Node => keys.reduce<Node>((current, key) => resolve(current[key]), spec);
const names = (node: Node): string[] => Object.keys(node).sort();
const schema = (name: string): Node => at("components", "schemas", name);
const properties = (name: string): string[] => names(asNode(schema(name)["properties"]));

const LIST = "/api/v1/programs";
const ONE = "/api/v1/programs/{company}/{program}";

const window: ProgramWindowItem = {
  cycleYear: 2027,
  windowSeq: 1,
  opensOn: "2026-11-15",
  opensPrecision: "day",
  closesOn: null,
  closesPrecision: null,
  programStartsOn: null,
  programEndsOn: null,
  status: "upcoming",
  sourceUrl: "https://example.com/w",
};
const stage: ApplicationStage = { name: "Online application", description: "A short form.", sourceUrl: "https://example.com/s" };
const item: ProgramListItem = {
  id: "7f0e6a3e-0000-4000-8000-000000000001",
  slug: "graduate-program",
  name: "Example Graduate Program",
  programType: "graduate",
  cities: ["melbourne"],
  disciplines: [],
  sourceUrl: "https://careers.example.com.au/graduates",
  company: { slug: "example-co", name: "Example Co", careersUrl: "https://careers.example.com.au" },
  status: "open",
  windows: [window],
  eligibilityRules: { schemaVersion: 1 },
  rulesVerified: true,
  applicationStages: [stage],
  rulesVersion: 1,
};

const NOW = new Date("2026-10-03T14:00:00Z");
const allow: RequestLimiter = () => ({ allowed: true, retryAfterSeconds: 0 });
const deny: RequestLimiter = () => ({ allowed: false, retryAfterSeconds: 42 });
const silent = vi.fn();

async function errorsFromTheHandlers(): Promise<{ route: string; status: number; code: string }[]> {
  const page: ProgramsPage = { items: [item], total: 1 };
  const list = (limit: RequestLimiter, fail = false) =>
    createProgramsHandler({
      list: () => (fail ? Promise.reject(new Error("db password=hunter2")) : Promise.resolve(page)),
      limit,
      now: () => NOW,
      log: silent,
    });
  const one = (limit: RequestLimiter, result: "found" | "missing" | "broken") =>
    createProgramHandler({
      get: () =>
        result === "broken" ? Promise.reject(new Error("db password=hunter2")) : Promise.resolve(result === "found" ? item : null),
      limit,
      now: () => NOW,
      log: silent,
    });
  const context = (company: string, program: string) => ({ params: Promise.resolve({ company, program }) });
  const listRequest = (query = "") => new Request(`http://localhost${LIST}${query}`);
  const oneRequest = () => new Request("http://localhost/api/v1/programs/example-co/graduate-program");

  const responses: [string, Response][] = [
    [LIST, await list(deny)(listRequest())],
    [LIST, await list(allow)(listRequest("?limit=0"))],
    [LIST, await list(allow, true)(listRequest())],
    [ONE, await one(deny, "found")(oneRequest(), context("example-co", "graduate-program"))],
    [ONE, await one(allow, "missing")(oneRequest(), context("example-co", "nope"))],
    [ONE, await one(allow, "found")(oneRequest(), context("not a slug!", "graduate-program"))],
    [ONE, await one(allow, "broken")(oneRequest(), context("example-co", "graduate-program"))],
  ];
  return Promise.all(
    responses.map(async ([route, response]) => ({
      route,
      status: response.status,
      code: ((await response.json()) as { error: { code: string } }).error.code,
    })),
  );
}

describe("openapi.yaml: what it covers", () => {
  it("is OpenAPI 3.1 and describes exactly the two public routes, each a GET that needs no sign-in", () => {
    expect(String(spec["openapi"])).toMatch(/^3\.1\./);
    const paths = at("paths");
    expect(names(paths)).toEqual([ONE, LIST].sort());
    for (const path of [LIST, ONE]) {
      const operations = asNode(paths[path]);
      expect(names(operations)).toEqual(["get"]);
      expect(asNode(operations)["get"]).toMatchObject({ security: [] });
    }
  });
});

describe("openapi.yaml: the request", () => {
  const parameters = (): Node[] => (at("paths", LIST, "get")["parameters"] as Json[]).map(resolve);

  it("documents every query parameter the list route accepts, and the server accepts each one", () => {
    const documented = parameters().map((parameter) => String(parameter["name"]));
    expect(documented.sort()).toEqual(["discipline", "limit", "offset", "openNow", "type"]);

    const sample: Record<string, string> = { discipline: "law", limit: "10", offset: "0", openNow: "true", type: "graduate" };
    for (const name of documented) {
      expect(parseProgramsQuery(new URLSearchParams({ [name]: sample[name] ?? "" })).ok).toBe(true);
    }
    expect(parseProgramsQuery(new URLSearchParams({ undocumented: "1" })).ok).toBe(false);
  });

  it("gives the same allowed values and limits as the code", () => {
    const byName = (name: string): Node => asNode(parameters().find((parameter) => parameter["name"] === name)?.["schema"]);

    expect(byName("type")["enum"]).toEqual([...PROGRAM_TYPES]);
    expect(byName("discipline")["enum"]).toEqual([...DISCIPLINES]);
    expect(byName("limit")).toMatchObject({ default: DEFAULT_LIMIT, minimum: 1, maximum: MAX_LIMIT });
    expect(byName("openNow")["type"]).toBe("boolean");
  });

  it("describes the two slugs with the rule the server applies", () => {
    const params = (at("paths", ONE, "get")["parameters"] as Json[]).map(resolve);
    expect(params.map((parameter) => parameter["name"])).toEqual(["company", "program"]);
    for (const parameter of params) {
      const slug = asNode(parameter["schema"]);
      const pattern = new RegExp(String(slug["pattern"]));
      expect(parameter["in"]).toBe("path");
      expect(parameter["required"]).toBe(true);
      expect(pattern.test("graduate-program")).toBe(true);
      expect(pattern.test("a--b")).toBe(false);
      expect(pattern.test("a b")).toBe(false);
      expect(slugFromPath("a".repeat(Number(slug["maxLength"])))).not.toBeNull();
      expect(slugFromPath("a".repeat(Number(slug["maxLength"]) + 1))).toBeNull();
    }
  });
});

describe("openapi.yaml: the response", () => {
  it("describes a program with exactly the fields the API returns, all of them always present", () => {
    const real = Object.keys(toPublicProgram(item)).sort();
    expect(properties("Program")).toEqual(real);
    expect([...(schema("Program")["required"] as string[])].sort()).toEqual(real);
  });

  it("describes the company, a window and a stage with exactly their real fields", () => {
    expect(properties("Company")).toEqual(Object.keys(item.company).sort());
    expect(properties("Window")).toEqual(Object.keys(window).sort());
    expect(properties("ApplicationStage")).toEqual(Object.keys(stage).sort());
  });

  it("limits the application stages to a list of at most 12, each with a required source link", () => {
    const stages = asNode(asNode(schema("Program")["properties"])["applicationStages"]);
    expect(stages).toMatchObject({ type: "array", maxItems: 12 });
    expect(schema("ApplicationStage")["required"]).toContain("sourceUrl");
  });

  it("names the same allowed values for program type, window status and date precision as the code", () => {
    const programProperties = asNode(schema("Program")["properties"]);
    expect(resolve(programProperties["programType"])["enum"]).toEqual([...PROGRAM_TYPES]);
    expect(resolve(programProperties["status"])["enum"]).toEqual(["upcoming", "open", "closed", "unknown"]);
    const windowProperties = asNode(schema("Window")["properties"]);
    expect(asNode(windowProperties["opensPrecision"])["enum"]).toEqual(["day", "month", "estimated", null]);
  });

  it("wraps every answer in the success / data / error / meta envelope", () => {
    for (const name of ["ProgramEnvelope", "ProgramListEnvelope", "ErrorEnvelope"]) {
      expect([...(schema(name)["required"] as string[])].sort()).toEqual(["data", "error", "meta", "success"]);
    }
    expect(properties("PageMeta")).toEqual(["limit", "page", "total"]);
  });

  it("has examples that match the real shape of a program", () => {
    const example = asNode(at("components", "examples", "ProgramList")["value"]);
    const first = asNode((asNode(example)["data"] as Json[])[0]);
    expect(Object.keys(first).sort()).toEqual(Object.keys(toPublicProgram(item)).sort());
  });
});

describe("openapi.yaml: errors, caching and the rate limit", () => {
  it("documents every error the handlers can send, under the status they send it with", async () => {
    const sent = await errorsFromTheHandlers();
    expect(sent.map((error) => `${error.route} ${error.status} ${error.code}`).sort()).toEqual(
      [
        `${LIST} 429 RATE_LIMITED`,
        `${LIST} 400 VALIDATION_ERROR`,
        `${LIST} 500 INTERNAL_ERROR`,
        `${ONE} 429 RATE_LIMITED`,
        `${ONE} 404 PROGRAM_NOT_FOUND`,
        `${ONE} 404 PROGRAM_NOT_FOUND`,
        `${ONE} 500 INTERNAL_ERROR`,
      ].sort(),
    );

    const codes = asNode(schema("ErrorBody")["properties"])["code"];
    for (const error of sent) {
      expect(at("paths", error.route, "get", "responses")).toHaveProperty(String(error.status));
      expect(asNode(codes)["enum"]).toContain(error.code);
    }
  });

  it("says a rate-limited answer carries Retry-After, and a good answer says how long it may be cached", () => {
    expect(at("components", "headers")).toHaveProperty("RetryAfter");
    expect(at("paths", LIST, "get", "responses", "429", "headers")).toHaveProperty("Retry-After");
    expect(at("paths", ONE, "get", "responses", "429", "headers")).toHaveProperty("Retry-After");
    expect(at("paths", LIST, "get", "responses", "200", "headers")).toHaveProperty("Cache-Control");
    expect(at("paths", ONE, "get", "responses", "200", "headers")).toHaveProperty("Cache-Control");
  });

  it("states the rate limit the server enforces, shared by both routes", () => {
    expect(spec["x-rate-limit"]).toMatchObject({
      requests: PUBLIC_API_MAX_REQUESTS,
      windowSeconds: PUBLIC_API_WINDOW_MS / 1000,
      sharedAcrossRoutes: true,
    });
  });
});
