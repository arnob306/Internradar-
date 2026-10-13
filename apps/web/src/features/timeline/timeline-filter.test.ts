import { describe, expect, it } from "vitest";
import { parseTimelineFilter, timelineHref, TIMELINE_FILTERS } from "./timeline-filter";

const params = (text: string): URLSearchParams => new URLSearchParams(text);

describe("parseTimelineFilter", () => {
  it("shows every program when no type is asked for", () => {
    expect(parseTimelineFilter(params(""))).toEqual({ type: undefined, isValid: true });
  });

  it.each(["graduate", "vacationer"] as const)("accepts type=%s", (type) => {
    expect(parseTimelineFilter(params(`type=${type}`))).toEqual({ type, isValid: true });
  });

  it("ignores a type the timeline does not offer, and says the link was not valid", () => {
    expect(parseTimelineFilter(params("type=internship"))).toEqual({ type: undefined, isValid: false });
    expect(parseTimelineFilter(params("type=nonsense"))).toEqual({ type: undefined, isValid: false });
    expect(parseTimelineFilter(params("type="))).toEqual({ type: undefined, isValid: false });
  });

  it("does not guess when type is given twice", () => {
    expect(parseTimelineFilter(params("type=graduate&type=vacationer"))).toEqual({
      type: undefined,
      isValid: false,
    });
  });

  it("leaves other parameters alone, so a shared link with tracking codes still works", () => {
    expect(parseTimelineFilter(params("utm_source=club&type=graduate"))).toEqual({
      type: "graduate",
      isValid: true,
    });
    expect(parseTimelineFilter(params("utm_source=club"))).toEqual({ type: undefined, isValid: true });
  });
});

describe("timelineHref", () => {
  it("is the plain home page for everything", () => {
    expect(timelineHref(undefined)).toBe("/");
  });

  it("puts the chosen type in the address", () => {
    expect(timelineHref("graduate")).toBe("/?type=graduate");
    expect(timelineHref("vacationer")).toBe("/?type=vacationer");
  });
});

describe("TIMELINE_FILTERS", () => {
  it("offers all programs first, then each type, with plain labels", () => {
    expect(TIMELINE_FILTERS).toEqual([
      { type: undefined, label: "All programs" },
      { type: "graduate", label: "Graduate" },
      { type: "vacationer", label: "Vacationer" },
    ]);
  });
});
