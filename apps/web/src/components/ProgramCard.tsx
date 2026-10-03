import type { CriterionResult, ProgramType, Verdict } from "@internradar/domain";
import Link from "next/link";
import type { ReactElement } from "react";
import { describeWindows } from "../features/programs/window-text";
import type { PublicProgram } from "../server/programs/programs-handler";
import { EligibilityBadge } from "./EligibilityBadge";
import { StatusChip } from "./StatusChip";

const TYPE_LABELS: Readonly<Record<ProgramType, string>> = {
  internship: "Internship",
  vacationer: "Vacationer",
  graduate: "Graduate",
  cadetship: "Cadetship",
  discovery: "Discovery",
};

export interface CardEligibility {
  readonly verdict: Verdict;
  readonly reasons: readonly CriterionResult[];
}

interface ProgramCardProps {
  readonly program: PublicProgram;
  /** Present once the visitor is signed in and has a profile; absent for anonymous visitors. */
  readonly eligibility?: CardEligibility;
}

/**
 * One program in the feed. Only the title is a link; CSS stretches it over the card, so the
 * eligibility button below it is never nested inside an anchor.
 */
export function ProgramCard({ program, eligibility }: ProgramCardProps): ReactElement {
  const window = describeWindows(program.windows, program.status);

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
        <span className="program-card-type">{TYPE_LABELS[program.programType]}</span>
      </div>

      <StatusChip status={program.status} />

      <p className="program-card-dates">
        {window.text}
        {window.estimated && <span className="program-card-estimated">estimated</span>}
      </p>

      <div className="program-card-footer">
        {eligibility === undefined ? (
          <span className="muted">Sign in to check if you&apos;re eligible.</span>
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
