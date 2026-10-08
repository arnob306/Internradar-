import type { CriterionResult, Verdict } from "@internradar/domain";
import Link from "next/link";
import type { ReactElement } from "react";
import { describeWindows } from "../features/programs/window-text";
import { PROGRAM_TYPE_LABELS } from "../features/vocabulary-labels";
import type { PublicProgram } from "../server/programs/programs-handler";
import { EligibilityBadge } from "./EligibilityBadge";
import { StatusChip } from "./StatusChip";

export interface CardEligibility {
  readonly verdict: Verdict;
  readonly reasons: readonly CriterionResult[];
}

interface ProgramCardProps {
  readonly program: PublicProgram;
  /** Present once the visitor is signed in and has a profile; absent for anonymous visitors. */
  readonly eligibility?: CardEligibility;
  /** What to ask when there is no answer yet: a visitor signs in, a student adds a profile. */
  readonly prompt?: "sign-in" | "profile";
}

/**
 * One program in the feed. Only the title is a link; CSS stretches it over the card, so the
 * eligibility button below it is never nested inside an anchor.
 */
export function ProgramCard({ program, eligibility, prompt = "sign-in" }: ProgramCardProps): ReactElement {
  const window = describeWindows(program.windows, program.status);
  const programPath = `/programs/${encodeURIComponent(program.company.slug)}/${encodeURIComponent(program.slug)}`;

  return (
    <article className="program-card">
      <div className="program-card-head">
        <div>
          <div className="program-card-company">{program.company.name}</div>
          <h3 className="program-card-title">
            <Link
              className="program-card-link"
              href={`/programs/${encodeURIComponent(program.company.slug)}/${encodeURIComponent(program.slug)}`}
            >
              {program.name}
            </Link>
          </h3>
        </div>
        <span className="program-card-type">{PROGRAM_TYPE_LABELS[program.programType]}</span>
      </div>

      <StatusChip status={program.status} />

      <p className="program-card-dates">
        {window.text}
        {window.estimated && <span className="program-card-estimated">estimated</span>}
      </p>

      <div className="program-card-footer">
        {eligibility === undefined ? (
          <Link
            href={prompt === "profile" ? "/profile" : `/login?next=${encodeURIComponent(programPath)}`}
          >
            {prompt === "profile"
              ? "Add your profile to check if you're eligible."
              : "Sign in to check if you're eligible."}
          </Link>
        ) : (
          <EligibilityBadge
            verdict={eligibility.verdict}
            reasons={eligibility.reasons}
            subject={program.name}
          />
        )}
      </div>
    </article>
  );
}
