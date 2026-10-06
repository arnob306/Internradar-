import { describe, expect, it } from "vitest";
import { feedHref } from "./feed-href";
import type { ProgramsQuery } from "./programs-query";

function query(overrides: Partial<ProgramsQuery> = {}): ProgramsQuery {
  return { limit: 20, offset: 0, type: undefined, discipline: undefined, openNow: false, ...overrides };
}

describe("feedHref", () => {
  it("is the bare feed when nothing is filtered", () => {
    expect(feedHref(query(), {})).toBe("/");
  });

  it("adds a filter", () => {
    expect(feedHref(query(), { type: "graduate" })).toBe("/?type=graduate");
    expect(feedHref(query(), { openNow: true })).toBe("/?openNow=true");
  });

  it("keeps the filters already chosen when another is added, in a stable order", () => {
    expect(feedHref(query({ openNow: true }), { type: "graduate" })).toBe(
      "/?type=graduate&openNow=true",
    );
    expect(feedHref(query({ type: "graduate" }), { discipline: "physics", openNow: true })).toBe(
      "/?type=graduate&discipline=physics&openNow=true",
    );
  });

  it("removes a filter that is cleared or switched off", () => {
    expect(feedHref(query({ type: "graduate" }), { type: undefined })).toBe("/");
    expect(feedHref(query({ openNow: true }), { openNow: false })).toBe("/");
  });

  it("goes back to the first page whenever a filter changes", () => {
    expect(feedHref(query({ offset: 40 }), { type: "graduate" })).toBe("/?type=graduate");
  });

  it("keeps the filters when only the page changes", () => {
    expect(feedHref(query({ type: "graduate" }), { offset: 20 })).toBe("/?type=graduate&offset=20");
    expect(feedHref(query({ type: "graduate", offset: 20 }), { offset: 0 })).toBe("/?type=graduate");
  });

  it("keeps a non-default page size, and drops the default one", () => {
    expect(feedHref(query({ limit: 50 }), { type: "graduate" })).toBe("/?type=graduate&limit=50");
    expect(feedHref(query({ limit: 20 }), { type: "graduate" })).toBe("/?type=graduate");
  });
});
