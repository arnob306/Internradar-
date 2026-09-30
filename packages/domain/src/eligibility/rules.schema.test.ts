import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { eligibilityRulesSchema, parseEligibilityRules } from "./rules.schema";

// Stored rules are JSON written by people and by an extraction step, so nothing about them
// can be trusted until it has been parsed. This is the boundary (review findings M1 and L3).
const FULL = {
  schemaVersion: 1,
  yearLevel: { preset: "penultimate" },
  graduationWindow: { earliest: { year: 2027, month: 1 }, latest: { year: 2027, month: 12 } },
  citizenship: { allowed: ["au_citizen", "au_pr"] },
  disciplines: { anyOf: ["stem_any", "law"] },
  degreeLevels: { allowed: ["undergraduate"] },
  acceptsMidYearGraduates: true,
};

describe("parseEligibilityRules: accepts good rules", () => {
  it("accepts a complete rule set unchanged", () => {
    expect(parseEligibilityRules(FULL)).toEqual({ ok: true, rules: FULL });
  });

  it("accepts a rule set with no restrictions", () => {
    expect(parseEligibilityRules({ schemaVersion: 1 })).toEqual({
      ok: true,
      rules: { schemaVersion: 1 },
    });
  });

  it("accepts explicit semester bounds", () => {
    const rules = {
      schemaVersion: 1,
      yearLevel: { minSemestersRemaining: 2, maxSemestersRemaining: 3, measuredAt: "program_end" },
    };

    expect(parseEligibilityRules(rules).ok).toBe(true);
  });

  it("accepts a discipline group as well as single disciplines", () => {
    expect(parseEligibilityRules({ schemaVersion: 1, disciplines: { anyOf: ["stem_any"] } }).ok).toBe(true);
  });

  it("does not change its input", () => {
    const frozen = Object.freeze(JSON.parse(JSON.stringify(FULL)) as typeof FULL);

    expect(parseEligibilityRules(frozen).ok).toBe(true);
  });
});

describe("parseEligibilityRules: rejects bad rules", () => {
  const withRule = (extra: Record<string, unknown>) => ({ schemaVersion: 1, ...extra });

  it.each([
    ["null", null],
    ["a string", "rules"],
    ["an array", []],
    ["an empty object", {}],
    ["a wrong schema version", { schemaVersion: 2 }],
    ["an unknown top-level field", withRule({ visaType: "482" })],
    ["a discipline outside the vocabulary", withRule({ disciplines: { anyOf: ["compsci"] } })],
    ["an empty discipline list", withRule({ disciplines: { anyOf: [] } })],
    ["an empty citizenship list", withRule({ citizenship: { allowed: [] } })],
    ["a citizenship rule with no list", withRule({ citizenship: {} })],
    ["an unknown citizenship value", withRule({ citizenship: { allowed: ["martian"] } })],
    ["an empty degree list", withRule({ degreeLevels: { allowed: [] } })],
    ["a month of 13", withRule({ graduationWindow: { earliest: { year: 2027, month: 13 } } })],
    ["a fractional month", withRule({ graduationWindow: { earliest: { year: 2027, month: 1.5 } } })],
    ["a window that ends before it starts", withRule({ graduationWindow: { earliest: { year: 2028, month: 1 }, latest: { year: 2027, month: 1 } } })],
    ["an unknown year-level preset", withRule({ yearLevel: { preset: "sophomore" } })],
    ["bounds with the minimum above the maximum", withRule({ yearLevel: { minSemestersRemaining: 4, maxSemestersRemaining: 2, measuredAt: "program_end" } })],
    ["a negative semester count", withRule({ yearLevel: { minSemestersRemaining: -1, measuredAt: "program_end" } })],
    ["a fractional semester count", withRule({ yearLevel: { minSemestersRemaining: 1.5, measuredAt: "program_end" } })],
    ["bounds without saying where they are measured", withRule({ yearLevel: { minSemestersRemaining: 1 } })],
    ["a preset mixed with bounds", withRule({ yearLevel: { preset: "penultimate", minSemestersRemaining: 1, measuredAt: "program_end" } })],
    ["a non-boolean mid-year flag", withRule({ acceptsMidYearGraduates: "yes" })],
  ])("rejects %s", (_label, input) => {
    expect(parseEligibilityRules(input).ok).toBe(false);
  });

  it("says where the problem is, so a reviewer can fix it", () => {
    const result = parseEligibilityRules(withRule({ citizenship: { allowed: ["martian"] } }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.join("\n")).toContain("citizenship");
    }
  });

  it("never throws, whatever it is given", () => {
    for (const input of [undefined, Number.NaN, Symbol("x"), () => 1, { toString: 5 }]) {
      expect(() => parseEligibilityRules(input)).not.toThrow();
    }
  });
});

// The JSON Schema is the contract the Python workers read (architecture overview §4). It is
// generated from the Zod schema and committed, and this test fails if the two drift apart.
describe("JSON Schema contract", () => {
  const committedPath = fileURLToPath(
    new URL("../../schemas/eligibility-rules.v1.json", import.meta.url),
  );
  const generated = `${JSON.stringify(z.toJSONSchema(eligibilityRulesSchema), null, 2)}\n`;

  it("matches the committed file exactly (run `pnpm --filter @internradar/domain generate:schema`)", () => {
    expect(readFileSync(committedPath, "utf8")).toBe(generated);
  });

  it("forbids unknown fields and pins the schema version", () => {
    const schema = JSON.parse(generated) as {
      additionalProperties: boolean;
      required: string[];
      properties: { schemaVersion: { const: number } };
    };

    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toContain("schemaVersion");
    expect(schema.properties.schemaVersion.const).toBe(1);
  });
});
