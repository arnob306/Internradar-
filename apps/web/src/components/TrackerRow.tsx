"use client";

import { nextStatuses } from "@internradar/domain";
import Link from "next/link";
import { useId, useState, type ReactElement } from "react";
import { APPLICATION_STATUS_LABELS } from "../features/vocabulary-labels";
import type { ApplicationRecord } from "../server/applications/applications-handler";

const MAX_NOTES = 2000;
const API = "/api/v1/me/applications";
const MONTHS = [
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

const MESSAGES = {
  signedOut: "Sign in again to keep tracking.",
  rateLimited: "You're changing things too quickly. Wait a minute, then try again.",
  conflict: "This changed in the meantime. Reload the page and try again.",
  nothingToUndo: "There is nothing to undo.",
  failed: "We couldn't update this. Try again in a moment.",
} as const;

interface TrackerRowProps {
  readonly initial: ApplicationRecord;
  readonly onRemoved: (id: string) => void;
}

type Outcome = { readonly ok: true; readonly record: ApplicationRecord | null } | { readonly ok: false; readonly message: string };

/** "2026-10-02" as "2 October 2026", read from the text so no time zone can move the day. */
function longDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${Number(day)} ${MONTHS[Number(month) - 1] ?? ""} ${year}`;
}

async function problemFrom(response: Response): Promise<string> {
  if (response.status === 401) {
    return MESSAGES.signedOut;
  }
  if (response.status === 429) {
    return MESSAGES.rateLimited;
  }
  if (response.status === 409) {
    const body: unknown = await response.json().catch(() => null);
    const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
    return code === "NOTHING_TO_UNDO" ? MESSAGES.nothingToUndo : MESSAGES.conflict;
  }
  return MESSAGES.failed;
}

/** One request to the tracker API. A failure carries a calm message, never the server's detail. */
async function send(path: string, method: "PATCH" | "POST" | "DELETE", body?: unknown): Promise<Outcome> {
  try {
    const response = await fetch(path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      return { ok: false, message: await problemFrom(response) };
    }
    if (response.status === 204) {
      return { ok: true, record: null };
    }
    const parsed = (await response.json()) as { data: ApplicationRecord };
    return { ok: true, record: parsed.data };
  } catch {
    return { ok: false, message: MESSAGES.failed };
  }
}

export function TrackerRow({ initial, onRemoved }: TrackerRowProps): ReactElement {
  const notesId = useId();
  const [record, setRecord] = useState(initial);
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notesSaved, setNotesSaved] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const path = `${API}/${encodeURIComponent(record.id)}`;
  const programHref = `/programs/${encodeURIComponent(record.companySlug)}/${encodeURIComponent(record.programSlug)}`;
  const notesChanged = notes !== (record.notes ?? "");

  /** Runs one change: shows its answer, or a message and leaves the row as it was. */
  async function run(request: () => Promise<Outcome>): Promise<Outcome | null> {
    if (busy) {
      return null;
    }
    setBusy(true);
    setProblem(null);
    const outcome = await request();
    setBusy(false);
    if (!outcome.ok) {
      setProblem(outcome.message);
    }
    return outcome;
  }

  async function change(request: () => Promise<Outcome>): Promise<void> {
    const outcome = await run(request);
    if (outcome?.ok === true && outcome.record !== null) {
      setRecord(outcome.record);
      setNotes(outcome.record.notes ?? "");
    }
  }

  async function saveNotes(): Promise<void> {
    const outcome = await run(() => send(path, "PATCH", { notes }));
    if (outcome?.ok === true && outcome.record !== null) {
      setRecord(outcome.record);
      setNotes(outcome.record.notes ?? "");
      setNotesSaved(true);
    }
  }

  async function remove(): Promise<void> {
    const outcome = await run(() => send(path, "DELETE"));
    if (outcome?.ok === true) {
      onRemoved(record.id);
    } else {
      setConfirmingRemove(false);
    }
  }

  return (
    <li className="tracker-row" aria-label={record.programName}>
      <div className="tracker-head">
        <div>
          <Link href={programHref} className="tracker-name">
            {record.programName}
          </Link>
          <p className="tracker-meta">
            <span>{record.companyName}</span> <span>{record.cycleYear} intake</span>
          </p>
        </div>
        <div className="tracker-status">
          <span className="tracker-chip" data-status={record.status}>
            {APPLICATION_STATUS_LABELS[record.status]}
          </span>
          {record.appliedAt !== null && <span className="muted">Applied {longDate(record.appliedAt)}</span>}
        </div>
      </div>

      <div className="tracker-actions">
        {nextStatuses(record.status).map((status) => (
          <button
            key={status}
            type="button"
            disabled={busy}
            onClick={() => void change(() => send(path, "PATCH", { status }))}
          >
            Move to {APPLICATION_STATUS_LABELS[status]}
          </button>
        ))}
        {record.status !== "saved" && (
          <button type="button" disabled={busy} onClick={() => void change(() => send(`${path}/undo`, "POST"))}>
            Undo last move
          </button>
        )}
      </div>

      <div className="tracker-notes">
        <label htmlFor={notesId}>Notes for {record.programName}</label>
        <textarea
          id={notesId}
          value={notes}
          maxLength={MAX_NOTES}
          rows={3}
          onChange={(event) => {
            setNotes(event.target.value);
            setNotesSaved(false);
          }}
        />
        <button type="button" disabled={busy || !notesChanged} onClick={() => void saveNotes()}>
          Save notes
        </button>
        {notesSaved && !notesChanged && <span className="muted">Notes saved</span>}
      </div>

      {problem !== null && (
        <p role="alert" className="field-problem">
          {problem}
        </p>
      )}

      {confirmingRemove ? (
        <div className="tracker-confirm">
          <p>Remove this program from your tracker? Its notes and history go with it.</p>
          <button type="button" disabled={busy} onClick={() => void remove()}>
            Yes, remove
          </button>
          <button type="button" disabled={busy} onClick={() => setConfirmingRemove(false)}>
            Keep it
          </button>
        </div>
      ) : (
        <button type="button" className="tracker-remove" disabled={busy} onClick={() => setConfirmingRemove(true)}>
          Remove
        </button>
      )}
    </li>
  );
}
