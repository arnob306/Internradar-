import { describe, expect, it } from "vitest";
import { toSearchParams } from "./search-params";

describe("toSearchParams", () => {
  it("turns Next's page parameters into URLSearchParams", () => {
    const params = toSearchParams({ type: "graduate", utm_source: "club" });

    expect(params.get("type")).toBe("graduate");
    expect(params.get("utm_source")).toBe("club");
  });

  it("keeps every value of a repeated parameter, so a repeat can be noticed and rejected", () => {
    const params = toSearchParams({ type: ["graduate", "vacationer"] });

    expect(params.getAll("type")).toEqual(["graduate", "vacationer"]);
  });

  it("skips parameters with no value and keeps an empty one", () => {
    const params = toSearchParams({ type: "", discipline: undefined });

    expect(params.getAll("type")).toEqual([""]);
    expect(params.has("discipline")).toBe(false);
  });
});
