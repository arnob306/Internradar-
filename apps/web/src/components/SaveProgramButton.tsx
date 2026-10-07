"use client";

import Link from "next/link";
import { useState, type ReactElement } from "react";

const MESSAGES = {
  signedOut: "Sign in to save programs to your tracker.",
  rateLimited: "You're saving too quickly. Wait a minute, then try again.",
  failed: "We couldn't save this program. Try again in a moment.",
} as const;

interface SaveProgramButtonProps {
  readonly programId: string;
  /** Whether this student already has the program in their tracker. */
  readonly initiallySaved: boolean;
}

type Status = "idle" | "saving" | "saved";

function problemFor(status: number): string {
  return status === 401 ? MESSAGES.signedOut : status === 429 ? MESSAGES.rateLimited : MESSAGES.failed;
}

export function SaveProgramButton({ programId, initiallySaved }: SaveProgramButtonProps): ReactElement {
  const [status, setStatus] = useState<Status>(initiallySaved ? "saved" : "idle");
  const [problem, setProblem] = useState<string | null>(null);

  async function save(): Promise<void> {
    if (status !== "idle") {
      return;
    }
    setStatus("saving");
    setProblem(null);
    try {
      const response = await fetch("/api/v1/me/applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ programId }),
      });
      // 201 is a new save and 200 means it was already there: either way it is in the tracker.
      if (response.ok) {
        setStatus("saved");
        return;
      }
      setProblem(problemFor(response.status));
    } catch {
      // Treated like any failure: the student is told, and no detail is shown.
      setProblem(MESSAGES.failed);
    }
    setStatus("idle");
  }

  if (status === "saved") {
    return (
      <p className="save-state">
        <span>Saved</span> <Link href="/tracker">View in my tracker</Link>
      </p>
    );
  }
  return (
    <>
      <button type="button" className="detail-save" disabled={status === "saving"} onClick={() => void save()}>
        {status === "saving" ? "Saving" : "Save to my tracker"}
      </button>
      {problem !== null && (
        <p role="alert" className="field-problem">
          {problem}
        </p>
      )}
    </>
  );
}
