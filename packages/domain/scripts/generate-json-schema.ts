/**
 * Writes the JSON Schema for stored eligibility rules. The Python workers validate rules
 * against this file, so it is committed, and a test fails if it drifts from the Zod schema.
 *
 * Run: pnpm --filter @internradar/domain generate:schema
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { eligibilityRulesSchema } from "../src/eligibility/rules.schema";

const target = fileURLToPath(new URL("../schemas/eligibility-rules.v1.json", import.meta.url));

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(z.toJSONSchema(eligibilityRulesSchema), null, 2)}\n`, "utf8");
