import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { safeExternalUrl } from "../features/programs/detail-guards";
import { describeWindows } from "../features/programs/window-text";
import type { ConfirmedEntry, NoDateEntry, TimelineProgram, UsualEntry } from "../features/timeline/build-timeline";
import type { TimelineLayout } from "../features/timeline/timeline-layout";
import { PROGRAM_TYPE_LABELS } from "../features/vocabulary-labels";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const programHref = (program: TimelineProgram): string =>
  `/programs/${encodeURIComponent(program.company.slug)}/${encodeURIComponent(program.slug)}`;

/** The program's name and employer, and a badge when the student has saved it. */
function Heading({ program, saved }: { readonly program: TimelineProgram; readonly saved: boolean }): ReactElement {
  return (
    <div className="timeline-head">
      <Link href={programHref(program)} className="timeline-name">
        {program.name}
      </Link>
      <span className="muted">
        {program.company.name} · {PROGRAM_TYPE_LABELS[program.programType]}
      </span>
      {saved && <span className="timeline-saved">Saved</span>}
    </div>
  );
}

function ConfirmedItem({ entry }: { readonly entry: ConfirmedEntry }): ReactElement {
  const text = describeWindows(
    [
      {
        status: entry.windowStatus,
        opensOn: entry.opensOn,
        opensPrecision: entry.opensPrecision,
        closesOn: entry.closesOn,
        closesPrecision: entry.closesPrecision,
      },
    ],
    entry.windowStatus,
  ).text;
  return (
    <li className="timeline-item" data-kind="confirmed">
      <Heading program={entry.program} saved={entry.saved} />
      <p className="timeline-when">{text}</p>
    </li>
  );
}

function intakes(cycleYears: readonly number[]): string {
  return `${cycleYears.join(" and ")} ${cycleYears.length === 1 ? "intake" : "intakes"}`;
}

function UsualItem({ entry, month }: { readonly entry: UsualEntry; readonly month: number }): ReactElement {
  return (
    <li className="timeline-item" data-kind="usual">
      <Heading program={entry.program} saved={entry.saved} />
      <p className="timeline-when">Usually opens around {MONTH_NAMES[month - 1]}</p>
      <p className="muted timeline-basis">
        Based on the {intakes(entry.basedOn.map((item) => item.cycleYear))}.{" "}
        {entry.basedOn.map((item) => {
          const url = safeExternalUrl(item.sourceUrl);
          return url === null ? null : (
            <a key={item.cycleYear} href={url} target="_blank" rel="noopener noreferrer">
              Source for the {item.cycleYear} intake
            </a>
          );
        })}
      </p>
    </li>
  );
}

function PlainItem({ entry }: { readonly entry: NoDateEntry }): ReactElement {
  return (
    <li className="timeline-item" data-kind="none">
      <Heading program={entry.program} saved={entry.saved} />
    </li>
  );
}

function Section({ id, title, children }: { readonly id: string; readonly title: string; readonly children: ReactNode }): ReactElement {
  return (
    <section className="timeline-section" aria-labelledby={`timeline-${id}`}>
      <h2 id={`timeline-${id}`}>{title}</h2>
      <ul className="timeline-list">{children}</ul>
    </section>
  );
}

/**
 * Everything opening, on one page (decision D19). A stated date and a "usually opens around" guess
 * are drawn differently and worded differently, so a guess is never taken for an announcement.
 */
export function TimelineView({ layout }: { readonly layout: TimelineLayout }): ReactElement {
  const empty =
    layout.now.length + layout.months.length + layout.later.length + layout.undated.length + layout.noDate.length === 0;
  if (empty) {
    return <p className="notice">There are no programs to show yet.</p>;
  }

  return (
    <div className="timeline">
      <p className="timeline-key" role="note">
        Solid entries are dates the employer has published. Dashed entries are guesses from earlier years: they
        show the month a program usually opens, not an announcement, and employers can change them.
      </p>

      {layout.now.length > 0 && (
        <Section id="now" title="Open now">
          {layout.now.map((entry) => (
            <ConfirmedItem key={entry.program.id} entry={entry} />
          ))}
        </Section>
      )}

      {layout.months.map((group) => (
        <Section key={`${group.year}-${group.month}`} id={`${group.year}-${group.month}`} title={`${MONTH_NAMES[group.month - 1]} ${group.year}`}>
          {group.confirmed.map((entry) => (
            <ConfirmedItem key={`c-${entry.program.id}`} entry={entry} />
          ))}
          {group.usual.map((entry) => (
            <UsualItem key={`u-${entry.program.id}`} entry={entry} month={group.month} />
          ))}
        </Section>
      ))}

      {layout.later.length > 0 && (
        <Section id="later" title="Opening later">
          {layout.later.map((entry) => (
            <ConfirmedItem key={entry.program.id} entry={entry} />
          ))}
        </Section>
      )}

      {layout.undated.length > 0 && (
        <Section id="undated" title="Opening soon, date not listed">
          {layout.undated.map((entry) => (
            <ConfirmedItem key={entry.program.id} entry={entry} />
          ))}
        </Section>
      )}

      {layout.noDate.length > 0 && (
        <Section id="none" title="No date yet">
          {layout.noDate.map((entry) => (
            <PlainItem key={entry.program.id} entry={entry} />
          ))}
        </Section>
      )}
    </div>
  );
}
