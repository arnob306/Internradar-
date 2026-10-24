import { describe, expect, it } from "vitest";
import { feedHref } from "./feed-href";
import type { ProgramsQuery } from "./programs-query";

function query(overrides: Partial<ProgramsQuery> = {}): ProgramsQuery {
  return { limit: 20, offset: 0, type: undefined, discipline: undefined, industry: undefined, openNow: false, ...overrides };
}

describe("feedHref", () => {
  it("is the bare feed when nothing is filtered", () => {
    expect(feedHref(query(), {})).toBe("/programs");
  });

  it("adds a filter", () => {
    expect(feedHref(query(), { type: "graduate" })).toBe("/programs?type=graduate");
    expect(feedHref(query(), { openNow: true })).toBe("/programs?openNow=true");
  });

  it("keeps the filters already chosen when another is added, in a stable order", () => {
    expect(feedHref(query({ openNow: true }), { type: "graduate" })).toBe(
      "/programs?type=graduate&openNow=true",
    );
    expect(feedHref(query({ type: "graduate" }), { discipline: "physics", openNow: true })).toBe(
      "/programs?type=graduate&discipline=physics&openNow=true",
    );
  });

  it("removes a filter that is cleared or switched off", () => {
    expect(feedHref(query({ type: "graduate" }), { type: undefined })).toBe("/programs");
    expect(feedHref(query({ openNow: true }), { openNow: false })).toBe("/programs");
  });

  it("goes back to the first page whenever a filter changes", () => {
    expect(feedHref(query({ offset: 40 }), { type: "graduate" })).toBe("/programs?type=graduate");
  });

  it("keeps the filters when only the page changes", () => {
    expect(feedHref(query({ type: "graduate" }), { offset: 20 })).toBe("/programs?type=graduate&offset=20");
    expect(feedHref(query({ type: "graduate", offset: 20 }), { offset: 0 })).toBe("/programs?type=graduate");
  });

  it("keeps a non-default page size, and drops the default one", () => {
    expect(feedHref(query({ limit: 50 }), { type: "graduate" })).toBe("/programs?type=graduate&limit=50");
    expect(feedHref(query({ limit: 20 }), { type: "graduate" })).toBe("/programs?type=graduate");
  });
});

describe("feedHref: industry", () => {
  it("adds an industry, after the type and discipline and before open now", () => {
    expect(feedHref(query(), { industry: "consulting" })).toBe("/programs?industry=consulting");
    expect(feedHref(query({ type: "graduate", openNow: true }), { industry: "consulting" })).toBe(
      "/programs?type=graduate&industry=consulting&openNow=true",
    );
  });

  it("keeps the industry when another filter changes, and removes it when cleared", () => {
    expect(feedHref(query({ industry: "technology" }), { type: "graduate" })).toBe(
      "/programs?type=graduate&industry=technology",
    );
    expect(feedHref(query({ industry: "technology" }), { industry: undefined })).toBe("/programs");
  });

  it("goes back to the first page when the industry changes, and keeps it when only the page changes", () => {
    expect(feedHref(query({ offset: 40 }), { industry: "other" })).toBe("/programs?industry=other");
    expect(feedHref(query({ industry: "other" }), { offset: 20 })).toBe("/programs?industry=other&offset=20");
  });
});
