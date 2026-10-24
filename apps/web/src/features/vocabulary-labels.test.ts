import { INDUSTRIES } from "@internradar/domain";
import { describe, expect, it } from "vitest";
import { INDUSTRY_LABELS } from "./vocabulary-labels";

describe("INDUSTRY_LABELS", () => {
  it("names every industry in plain words", () => {
    expect(Object.keys(INDUSTRY_LABELS).sort()).toEqual([...INDUSTRIES].sort());
    expect(INDUSTRY_LABELS).toMatchObject({
      banking_finance: "Banking and finance",
      consulting: "Consulting",
      technology: "Technology",
      engineering_resources: "Engineering and resources",
      government_defence: "Government and defence",
      other: "Other",
    });
  });
});
