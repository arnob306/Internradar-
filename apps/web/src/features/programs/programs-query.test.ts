import { describe, expect, it } from "vitest";
import { parseProgramsQuery } from "./programs-query";

function parse(query: string) {
  return parseProgramsQuery(new URLSearchParams(query));
}

function fieldsOf(query: string): string[] {
  const result = parse(query);
  if (result.ok) {
    throw new Error(`expected "${query}" to be rejected`);
  }
  return result.fields.map((error) => error.field);
}

describe("parseProgramsQuery", () => {
  it("defaults to the first page of 20 with no filters", () => {
    expect(parse("")).toEqual({
      ok: true,
      value: { limit: 20, offset: 0, type: undefined, discipline: undefined, openNow: false },
    });
  });

  it("accepts every filter together", () => {
    const result = parse("limit=50&offset=100&type=graduate&discipline=computer_science&openNow=true");

    expect(result).toEqual({
      ok: true,
      value: {
        limit: 50,
        offset: 100,
        type: "graduate",
        discipline: "computer_science",
        openNow: true,
      },
    });
  });

  it.each(["limit=0", "limit=101", "limit=-1", "limit=abc", "limit=1.5", "limit="])(
    "rejects %s with a field error on limit",
    (query) => {
      expect(fieldsOf(query)).toEqual(["limit"]);
    },
  );

  it.each(["limit=1", "limit=100"])("accepts the boundary %s", (query) => {
    expect(parse(query).ok).toBe(true);
  });

  it.each(["offset=-1", "offset=abc", "offset=2.5", "offset="])(
    "rejects %s with a field error on offset",
    (query) => {
      expect(fieldsOf(query)).toEqual(["offset"]);
    },
  );

  it("rejects an offset that is not a whole number of pages, so the page number is never misleading", () => {
    expect(fieldsOf("offset=5")).toEqual(["offset"]);
    expect(fieldsOf("limit=10&offset=15")).toEqual(["offset"]);
  });

  it.each(["offset=0", "offset=20", "limit=10&offset=30", "limit=50&offset=100"])(
    "accepts %s, a whole number of pages",
    (query) => {
      expect(parse(query).ok).toBe(true);
    },
  );

  it("reports only the limit when the limit is invalid, since pages cannot be worked out", () => {
    expect(fieldsOf("limit=0&offset=5")).toEqual(["limit"]);
  });

  it("rejects unknown query keys instead of ignoring them", () => {
    expect(fieldsOf("sort=name")).toEqual(["sort"]);
    expect(fieldsOf("limt=5")).toEqual(["limt"]);
  });

  it("rejects an unknown program type and an unknown discipline", () => {
    expect(fieldsOf("type=apprenticeship")).toEqual(["type"]);
    expect(fieldsOf("discipline=underwater_basket_weaving")).toEqual(["discipline"]);
  });

  it.each(["openNow=yes", "openNow=1", "openNow=TRUE", "openNow="])(
    "rejects %s: openNow is true or false",
    (query) => {
      expect(fieldsOf(query)).toEqual(["openNow"]);
    },
  );

  it("treats openNow=false as off", () => {
    const result = parse("openNow=false");

    expect(result.ok && result.value.openNow).toBe(false);
  });

  it("rejects a key given twice, which would otherwise be ambiguous", () => {
    expect(fieldsOf("limit=5&limit=10")).toEqual(["limit"]);
  });

  it("reports every problem at once, with a message for each", () => {
    const result = parse("limit=0&offset=-1&sort=name&type=nope");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fields.map((error) => error.field).sort()).toEqual([
        "limit",
        "offset",
        "sort",
        "type",
      ]);
      for (const error of result.fields) {
        expect(error.message.length).toBeGreaterThan(5);
      }
    }
  });
});
