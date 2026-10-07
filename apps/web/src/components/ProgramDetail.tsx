import { isDiscipline } from "@internradar/domain";
import Link from "next/link";
import type { ReactElement } from "react";
import { reasonText, verdictLabel } from "../features/eligibility/reason-text";
import { safeExternalUrl } from "../features/programs/detail-guards";
import { describeWindows } from "../features/programs/window-text";
import { DISCIPLINE_LABELS, PROGRAM_TYPE_LABELS } from "../features/vocabulary-labels";
import type { PublicProgram } from "../server/programs/programs-handler";
import type { CardEligibility } from "./ProgramCard";
import { SaveProgramButton } from "./SaveProgramButton";
import { StatusChip } from "./StatusChip";

interface ProgramDetailProps {
  readonly program: PublicProgram;
  /** The engine's answer for this student, once they are signed in and have a profile. */
  readonly eligibility?: CardEligibility;
  /** What to ask while there is no answer: a visitor signs in, a student adds a profile. */
  readonly prompt?: "sign-in" | "profile";
  /** Whether this student already has the program in their tracker. */
  readonly saved?: boolean;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function windowTitle(cycleYear: number, windowSeq: number): string {
  return windowSeq > 1 ? `${cycleYear} intake, round ${windowSeq}` : `${cycleYear} intake`;
}

type WindowItem = PublicProgram["windows"][number];

/** How exactly the employer gave the dates, for the small tag beside a window. */
function precisionNote(window: WindowItem, estimated: boolean): string | null {
  if (estimated) {
    return "estimated";
  }
  const precision = window.closesPrecision ?? window.opensPrecision;
  return precision === "day" ? "to the day" : precision === "month" ? "to the month" : null;
}

export function ProgramDetail({ program, eligibility, prompt = "sign-in", saved = false }: ProgramDetailProps): ReactElement {
  const path = `/programs/${encodeURIComponent(program.company.slug)}/${encodeURIComponent(program.slug)}`;
  const applyUrl = safeExternalUrl(program.sourceUrl);
  const areas = program.disciplines.filter(isDiscipline).map((discipline) => DISCIPLINE_LABELS[discipline]);

  return (
    <div className="detail">
      <Link href="/" className="detail-back">
        All programs
      </Link>

      <div className="detail-grid">
        <div className="detail-main">
          <p className="detail-company">{program.company.name}</p>
          <h1 className="detail-title">{program.name}</h1>
          <ul className="detail-tags" aria-label="About this program">
            <li>{PROGRAM_TYPE_LABELS[program.programType]}</li>
            {program.cities.map((city) => (
              <li key={city}>{capitalise(city)}</li>
            ))}
            {(areas.length > 0 ? areas : ["Any degree"]).map((area) => (
              <li key={area}>{area}</li>
            ))}
          </ul>
          <StatusChip status={program.status} />

          <section className="detail-panel" aria-labelledby="eligible-heading">
            <h2 id="eligible-heading">Are you eligible?</h2>
            {eligibility === undefined ? (
              <p>
                <Link
                  href={prompt === "profile" ? "/profile" : `/login?next=${encodeURIComponent(path)}`}
                >
                  {prompt === "profile"
                    ? "Add your profile to check if you're eligible."
                    : "Sign in to check if you're eligible."}
                </Link>
              </p>
            ) : (
              <>
                <p className="detail-verdict" data-verdict={eligibility.verdict}>
                  {verdictLabel(eligibility.verdict)}
                </p>
                <ul className="detail-reasons">
                  {eligibility.reasons.map((reason) => (
                    <li key={reason.criterion} data-verdict={reason.verdict}>
                      {reasonText(reason.code, reason.params)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="detail-panel" aria-labelledby="windows-heading">
            <h2 id="windows-heading">Application windows</h2>
            <p className="muted">What the employer&apos;s page says. We never show a date more precisely than it does.</p>
            {program.windows.length === 0 ? (
              <p>No application windows recorded yet.</p>
            ) : (
              <ul className="detail-windows" aria-label="Application windows">
                {program.windows.map((window) => {
                  const text = describeWindows([window], window.status);
                  const note = precisionNote(window, text.estimated);
                  return (
                    <li key={`${window.cycleYear}-${window.windowSeq}`}>
                      <strong>{windowTitle(window.cycleYear, window.windowSeq)}</strong>
                      <span>{text.text}</span>
                      {note !== null && <span className="detail-note">{note}</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className="detail-side">
          <div className="detail-panel">
            {prompt === "sign-in" ? (
              <Link href={`/login?next=${encodeURIComponent(path)}`}>Sign in to save this program</Link>
            ) : (
              <SaveProgramButton programId={program.id} initiallySaved={saved} />
            )}
          </div>
          <div className="detail-panel">
            {applyUrl === null ? (
              <p>We couldn&apos;t show a safe link to the employer&apos;s page.</p>
            ) : (
              <>
                <a className="detail-apply" href={applyUrl} target="_blank" rel="noopener noreferrer">
                  Apply on {program.company.name}&apos;s site
                </a>
                <p className="muted">Opens the employer&apos;s own page in a new tab.</p>
              </>
            )}
          </div>
          <div className="detail-panel">
            <p className="detail-trust">{program.rulesVerified ? "Checked by a person" : "Not checked yet"}</p>
            <p className="muted">
              {program.rulesVerified
                ? "Someone compared these requirements with the employer's page. Always confirm there before you apply."
                : "Nobody has compared these requirements with the employer's page yet. Read the requirements on the employer's page."}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
