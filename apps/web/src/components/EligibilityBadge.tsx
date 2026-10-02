"use client";

import type { CriterionResult, Verdict } from "@internradar/domain";
import { useId, useState, type ReactElement } from "react";
import { reasonText, verdictLabel } from "../features/eligibility/reason-text";

const ICON_PATHS: Readonly<Record<Verdict, ReactElement>> = {
  eligible: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  ineligible: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6M15 9l-6 6" />
    </>
  ),
  unknown: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.7M12 17h.01" />
    </>
  ),
};

interface EligibilityBadgeProps {
  readonly verdict: Verdict;
  readonly reasons: readonly CriterionResult[];
}

/**
 * The answer to "am I eligible?" as words, never colour alone, with the reasons one click
 * away. "Check requirements" is a first-class answer: the engine says it when it can't tell.
 */
export function EligibilityBadge({ verdict, reasons }: EligibilityBadgeProps): ReactElement {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();

  return (
    <div className="eligibility" data-verdict={verdict}>
      <span className="eligibility-label">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {ICON_PATHS[verdict]}
        </svg>
        {verdictLabel(verdict)}
      </span>
      {reasons.length > 0 && (
        <>
          <button
            type="button"
            className="eligibility-toggle"
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={() => setExpanded((open) => !open)}
          >
            Why?
          </button>
          {expanded && (
            <ul id={listId} className="eligibility-reasons">
              {reasons.map((reason) => (
                <li key={reason.criterion} data-verdict={reason.verdict}>
                  {reasonText(reason.code, reason.params)}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
