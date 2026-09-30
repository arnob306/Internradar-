import { z } from "zod";
import { monthPosition } from "../academic-calendar/year-month";
import type { EligibilityRules } from "./rules";
import {
  CITIZENSHIPS,
  DEGREE_LEVELS,
  DISCIPLINE_GROUPS,
  DISCIPLINES,
  type DisciplineGroup,
  type DisciplineTerm,
} from "./vocabulary";

/**
 * The shape of the rules stored as JSON on each program. Rules are written by people and by
 * an extraction step, so they are untrusted until parsed here. The schema is strict:
 * unknown fields, terms outside the frozen vocabulary, empty lists and contradictory bounds
 * are all rejected. The JSON Schema generated from it (schemas/eligibility-rules.v1.json)
 * is the contract the Python workers read.
 */
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;
const MAX_SEMESTERS = 20;

const monthSchema = z.literal([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

const yearMonthSchema = z.strictObject({
  year: z.int().min(MIN_YEAR).max(MAX_YEAR),
  month: monthSchema,
});

const presetRuleSchema = z.strictObject({
  preset: z.enum(["penultimate", "pre_penultimate", "final_year"]),
});

const boundsRuleSchema = z
  .strictObject({
    minSemestersRemaining: z.int().min(0).max(MAX_SEMESTERS).optional(),
    maxSemestersRemaining: z.int().min(0).max(MAX_SEMESTERS).optional(),
    measuredAt: z.enum(["program_start", "program_end"]),
  })
  .refine(
    (rule) =>
      rule.minSemestersRemaining === undefined ||
      rule.maxSemestersRemaining === undefined ||
      rule.minSemestersRemaining <= rule.maxSemestersRemaining,
    { message: "minSemestersRemaining must not be above maxSemestersRemaining" },
  );

const graduationWindowSchema = z
  .strictObject({
    earliest: yearMonthSchema.optional(),
    latest: yearMonthSchema.optional(),
  })
  .refine(
    (window) =>
      window.earliest === undefined ||
      window.latest === undefined ||
      monthPosition(window.earliest) <= monthPosition(window.latest),
    { message: "earliest must not be after latest" },
  );

const DISCIPLINE_TERMS = [
  ...DISCIPLINES,
  ...(Object.keys(DISCIPLINE_GROUPS) as DisciplineGroup[]),
] as [DisciplineTerm, ...DisciplineTerm[]];

export const eligibilityRulesSchema = z.strictObject({
  schemaVersion: z.literal(1),
  yearLevel: z.union([presetRuleSchema, boundsRuleSchema]).optional(),
  graduationWindow: graduationWindowSchema.optional(),
  citizenship: z.strictObject({ allowed: z.array(z.enum(CITIZENSHIPS)).min(1) }).optional(),
  disciplines: z.strictObject({ anyOf: z.array(z.enum(DISCIPLINE_TERMS)).min(1) }).optional(),
  degreeLevels: z.strictObject({ allowed: z.array(z.enum(DEGREE_LEVELS)).min(1) }).optional(),
  acceptsMidYearGraduates: z.boolean().optional(),
});

export type ParsedRules =
  | { readonly ok: true; readonly rules: EligibilityRules }
  | { readonly ok: false; readonly issues: readonly string[] };

/** Parses untrusted JSON into typed rules. Never throws; a bad rule comes back as issues. */
export function parseEligibilityRules(input: unknown): ParsedRules {
  const parsed = eligibilityRulesSchema.safeParse(input);
  if (parsed.success) {
    return { ok: true, rules: parsed.data };
  }
  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
  };
}
