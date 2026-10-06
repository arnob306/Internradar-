import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";

describe("contrastRatio", () => {
  it("is 21 for black on white, the maximum", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
  });

  it("is 1 for a colour on itself, the minimum", () => {
    expect(contrastRatio("#0B6E7A", "#0B6E7A")).toBeCloseTo(1, 5);
  });

  it("does not depend on which colour is the text", () => {
    expect(contrastRatio("#0F1B2D", "#F4F6F8")).toBeCloseTo(contrastRatio("#F4F6F8", "#0F1B2D"), 10);
  });

  it("matches a published reference value: #767676 on white is about 4.54", () => {
    expect(contrastRatio("#767676", "#FFFFFF")).toBeCloseTo(4.54, 2);
  });

  it("accepts lower-case and three-digit hex", () => {
    expect(contrastRatio("#fff", "#000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
  });

  it("rejects anything that is not a hex colour", () => {
    expect(() => contrastRatio("red", "#FFFFFF")).toThrow(/hex colour/);
    expect(() => contrastRatio("#12345", "#FFFFFF")).toThrow(/hex colour/);
  });
});
