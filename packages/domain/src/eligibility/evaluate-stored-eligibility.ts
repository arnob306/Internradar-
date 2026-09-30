import { ENGINE_VERSION, evaluateEligibility, type EligibilityResult } from "./evaluate-eligibility";
import type { StudentProfile, WindowContext } from "./rules";
import { parseEligibilityRules } from "./rules.schema";

/**
 * The safe way to judge eligibility from rules read out of the database. The rules are
 * untrusted JSON, so they are parsed first. A rule this engine cannot understand gives
 * "unknown" with RULES_INVALID, never a thrown error, so one bad program cannot break a
 * whole page of results.
 */
export function evaluateStoredEligibility(
  storedRules: unknown,
  profile: StudentProfile,
  context: WindowContext,
): EligibilityResult {
  if (!context.rulesVerified) {
    // Unverified rules are never evaluated or parsed; the engine reports that alone.
    return evaluateEligibility({ schemaVersion: 1 }, profile, context);
  }

  const parsed = parseEligibilityRules(storedRules);
  if (!parsed.ok) {
    return {
      verdict: "unknown",
      reasons: [
        {
          criterion: "rules",
          verdict: "unknown",
          code: "RULES_INVALID",
          params: { issueCount: parsed.issues.length },
        },
      ],
      rulesVersion: context.rulesVersion,
      engineVersion: ENGINE_VERSION,
    };
  }
  return evaluateEligibility(parsed.rules, profile, context);
}
