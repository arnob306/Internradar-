"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactElement } from "react";
import type { ApplicationRecord } from "../server/applications/applications-handler";
import { TrackerRow } from "./TrackerRow";

interface TrackerBoardProps {
  readonly initial: readonly ApplicationRecord[];
}

/** The student's saved programs and where each one stands. Each row looks after its own changes. */
export function TrackerBoard({ initial }: TrackerBoardProps): ReactElement {
  const [removed, setRemoved] = useState<readonly string[]>([]);
  const region = useRef<HTMLElement>(null);
  // A removed row takes the focused button with it, so focus goes to the list rather than the page.
  useEffect(() => {
    if (removed.length > 0) {
      region.current?.focus();
    }
  }, [removed.length]);
  const shown = initial.filter((application) => !removed.includes(application.id));

  return (
    <section aria-label="Your applications" tabIndex={-1} ref={region}>
      {shown.length === 0 ? (
        <div className="tracker-empty">
          <p>You haven&apos;t saved any programs yet. Save one from its page and it will show up here.</p>
          <Link href="/">Browse programs</Link>
        </div>
      ) : (
        <ul className="tracker-list">
          {shown.map((application) => (
            <TrackerRow
              key={application.id}
              initial={application}
              onRemoved={(id) => setRemoved((ids) => [...ids, id])}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
