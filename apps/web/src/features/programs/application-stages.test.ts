import { describe, expect, it } from "vitest";
import { parseStages } from "./application-stages";

const stage = (overrides: Record<string, unknown> = {}) => ({
  name: "Online application",
  description: "Your CV and a short form.",
  sourceUrl: "https://acme.example/grad",
  ...overrides,
});

describe("parseStages", () => {
  it("keeps a well-formed stage as it is", () => {
    expect(parseStages([stage()])).toEqual([
      { name: "Online application", description: "Your CV and a short form.", sourceUrl: "https://acme.example/grad" },
    ]);
  });

  it("keeps the employer's order", () => {
    const names = parseStages([stage({ name: "First" }), stage({ name: "Second" }), stage({ name: "Third" })]).map(
      (item) => item.name,
    );

    expect(names).toEqual(["First", "Second", "Third"]);
  });

  it("allows a stage with no description", () => {
    const [parsed] = parseStages([stage({ description: undefined })]);

    expect(parsed?.description).toBeNull();
  });

  it("trims the text", () => {
    const [parsed] = parseStages([stage({ name: "  Video interview ", description: " Recorded. " })]);

    expect(parsed).toMatchObject({ name: "Video interview", description: "Recorded." });
  });

  it("is an empty list for anything that is not a list", () => {
    for (const value of [null, undefined, {}, "Interview", 3, { name: "Interview" }]) {
      expect(parseStages(value)).toEqual([]);
    }
  });

  it("drops a stage with no name", () => {
    expect(parseStages([stage({ name: "" }), stage({ name: "   " }), stage({ name: 4 }), stage({ name: undefined })])).toEqual([]);
  });

  it("drops a stage with no safe source, since a stage must say where it came from", () => {
    const unsafe = [undefined, "", "javascript:alert(1)", "http://acme.example/x", "https://user:pw@acme.example/x", "https://seek.com.au/job"];

    expect(parseStages(unsafe.map((sourceUrl) => stage({ sourceUrl })))).toEqual([]);
  });

  it("drops items that are not objects, and keeps the good ones around them", () => {
    const names = parseStages([null, "x", 3, stage({ name: "Keep me" }), [stage()]]).map((item) => item.name);

    expect(names).toEqual(["Keep me"]);
  });

  it("ignores a description that is not text", () => {
    const [parsed] = parseStages([stage({ description: { html: "<b>x</b>" } })]);

    expect(parsed?.description).toBeNull();
  });

  it("limits how much one program can show", () => {
    const many = Array.from({ length: 30 }, (_, index) => stage({ name: `Stage ${index}` }));

    expect(parseStages(many)).toHaveLength(12);
    expect(parseStages([stage({ name: "x".repeat(500) })])).toEqual([]);
    const [long] = parseStages([stage({ description: "y".repeat(2000) })]);
    expect(long?.description?.length).toBeLessThanOrEqual(600);
  });
});
