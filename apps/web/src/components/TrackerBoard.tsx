"use client";

import Link from "next/link";
import { useState, type ReactElement } from "react";
import type { ApplicationRecord } from "../server/applications/applications-handler";
import { TrackerRow } from "./TrackerRow";

interface TrackerBoardProps {
  readonly initial: readonly ApplicationRecord[];
}

/** The student's saved programs and where each one stands. Each row looks after its own changes. */
export function TrackerBoard({ initial }: TrackerBoardProps): ReactElement {
  const [removed, setRemoved] = useState<readonly string[]>([]);
  const shown = initial.filter((application) => !removed.includes(application.id));

  if (shown.length === 0) {
    return (
      <div className="tracker-empty">
        <p>You haven&apos;t saved any programs yet. Save one from its page and it will show up here.</p>
        <Link href="/">Browse programs</Link>
      </div>
    );
  }
  return (
    <ul className="tracker-list" aria-label="Your applications">
      {shown.map((application) => (
        <TrackerRow
          key={application.id}
          initial={application}
          onRemoved={(id) => setRemoved((ids) => [...ids, id])}
        />
      ))}
    </ul>
  );
}
