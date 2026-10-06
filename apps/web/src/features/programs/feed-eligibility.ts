import type { StudentProfile } from "@internradar/domain";
import type { CardEligibility } from "../../components/ProgramCard";
import type { ProgramListItem } from "../../server/programs/list-programs";
import { evaluateProgram } from "./program-eligibility";

/**
 * The engine's answer for every program on the feed, for one student, keyed by program id. Each
 * program is judged on its own, and the engine never throws on bad stored rules (it answers
 * "check requirements"), so one odd program can never take a page of results down with it.
 */
export function eligibilityForFeed(
  items: readonly ProgramListItem[],
  profile: StudentProfile,
  today: string,
): Record<string, CardEligibility> {
  return Object.fromEntries(
    items.map((item) => {
      const { verdict, reasons } = evaluateProgram(item, profile, today);
      return [item.id, { verdict, reasons }];
    }),
  );
}
