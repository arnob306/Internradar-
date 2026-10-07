import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { safeExternalUrl } from "../features/programs/detail-guards";
import { describeWindows } from "../features/programs/window-text";
import type { ConfirmedEntry, NoDateEntry, TimelineProgram, UsualEntry } from "../features/timeline/build-timeline";
import type { Bar, Chart, ChartRow } from "../features/timeline/timeline-bars";
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

/** "Oct 2026" for the first month and each January, plain "Nov" otherwise, so the year is always clear. */
function monthLabel(year: number, month: number, isFirst: boolean): string {
  const short = (MONTH_NAMES[month - 1] ?? "").slice(0, 3);
  return isFirst || month === 1 ? `${short} ${year}` : short;
}

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

/** A stated window in words, exactly as precisely as the employer gave it. */
function statedText(entry: ConfirmedEntry): string {
  return describeWindows(
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
}

function intakes(cycleYears: readonly number[]): string {
  return `${cycleYears.join(" and ")} ${cycleYears.length === 1 ? "intake" : "intakes"}`;
}

function UsualText({ entry }: { readonly entry: UsualEntry }): ReactElement {
  const months = entry.occurrences.map((occurrence) => MONTH_NAMES[occurrence.month - 1]).join(" or ");
  return (
    <>
      <p className="timeline-when">Usually opens around {months}</p>
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
    </>
  );
}

function BarMark({ bar }: { readonly bar: Bar }): ReactElement {
  return (
    <span
      className="chart-bar"
      data-bar={bar.kind}
      data-open-end={!bar.endKnown}
      data-cut-start={bar.startsBefore}
      style={{ left: `${bar.startPct}%`, width: `${bar.endPct - bar.startPct}%` }}
    />
  );
}

function RowView({ row, todayPct }: { readonly row: ChartRow; readonly todayPct: number }): ReactElement {
  const { entry } = row;
  return (
    <tr className="chart-row">
      <th scope="row" className="chart-name">
        <Heading program={entry.program} saved={entry.saved} />
        {entry.kind === "confirmed" ? <p className="timeline-when">{statedText(entry)}</p> : <UsualText entry={entry} />}
      </th>
      <td className="chart-cell">
        {/* The picture only: the dates are already in words beside it. */}
        <div className="chart-track" aria-hidden="true">
          <span className="chart-today" data-today style={{ left: `${todayPct}%` }} />
          {row.bars.map((bar) => (
            <BarMark key={`${bar.kind}-${bar.startPct}`} bar={bar} />
          ))}
        </div>
      </td>
    </tr>
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

function ConfirmedItem({ entry }: { readonly entry: ConfirmedEntry }): ReactElement {
  return (
    <li className="timeline-item" data-kind="confirmed">
      <Heading program={entry.program} saved={entry.saved} />
      <p className="timeline-when">{statedText(entry)}</p>
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

/**
 * The year ahead as a chart (decision D19): a bar for each program over the months its applications
 * are open. Solid bars are dates the employer published; dashed bars are guesses from past cycles.
 */
export function TimelineChart({ chart }: { readonly chart: Chart }): ReactElement {
  const total = chart.rows.length + chart.later.length + chart.undated.length + chart.noDate.length;
  if (total === 0) {
    return <p className="notice">There are no programs to show yet.</p>;
  }

  return (
    <div className="timeline">
      <p className="timeline-key" role="note">
        Solid bars are dates the employer has published. Dashed bars are guesses from earlier years: they show
        the months a program was open last time, not an announcement, and employers can change them.
      </p>

      {chart.rows.length === 0 ? (
        <p className="notice">No program has a date in the next twelve months yet.</p>
      ) : (
        <table className="chart" aria-label="Applications over the next twelve months">
          <thead>
            <tr>
              <th scope="col" className="chart-name">
                Program
              </th>
              <th scope="col" className="chart-cell">
                <div className="chart-months">
                  {chart.axis.map((month, index) => (
                    <span key={`${month.year}-${month.month}`}>{monthLabel(month.year, month.month, index === 0)}</span>
                  ))}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {chart.rows.map((row) => (
              <RowView key={row.entry.program.id} row={row} todayPct={chart.todayPct} />
            ))}
          </tbody>
        </table>
      )}

      {chart.later.length > 0 && (
        <Section id="later" title="Opening later">
          {chart.later.map((entry) => (
            <ConfirmedItem key={entry.program.id} entry={entry} />
          ))}
        </Section>
      )}
      {chart.undated.length > 0 && (
        <Section id="undated" title="Opening soon, date not listed">
          {chart.undated.map((entry) => (
            <ConfirmedItem key={entry.program.id} entry={entry} />
          ))}
        </Section>
      )}
      {chart.noDate.length > 0 && (
        <Section id="none" title="No date yet">
          {chart.noDate.map((entry) => (
            <PlainItem key={entry.program.id} entry={entry} />
          ))}
        </Section>
      )}
    </div>
  );
}
