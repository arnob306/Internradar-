"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";

const MESSAGES = {
  signedOut: "Sign in to follow programs.",
  rateLimited: "You're changing things too quickly. Wait a minute, then try again.",
  failed: "We couldn't update this. Try again in a moment.",
} as const;

interface FollowProgramButtonProps {
  readonly programId: string;
  /** Whether this student already follows the program. */
  readonly initiallyFollowing: boolean;
}

function problemFor(status: number): string {
  return status === 401 ? MESSAGES.signedOut : status === 429 ? MESSAGES.rateLimited : MESSAGES.failed;
}

export function FollowProgramButton({ programId, initiallyFollowing }: FollowProgramButtonProps): ReactElement {
  const [following, setFollowing] = useState(initiallyFollowing);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const followRef = useRef<HTMLButtonElement>(null);
  // Only a change made here moves focus, since the control it replaces is gone. A page that loads
  // already following leaves focus where it is.
  const [changedHere, setChangedHere] = useState(false);

  useEffect(() => {
    if (changedHere) {
      (following ? statusRef.current : followRef.current)?.focus();
    }
  }, [changedHere, following]);

  async function change(): Promise<void> {
    if (pending) {
      return;
    }
    setPending(true);
    setProblem(null);
    try {
      const response = await fetch(`/api/v1/me/follows/${programId}`, {
        method: following ? "DELETE" : "PUT",
        headers: { "content-type": "application/json" },
      });
      if (response.ok) {
        setFollowing(!following);
        setChangedHere(true);
        setPending(false);
        return;
      }
      setProblem(problemFor(response.status));
    } catch {
      // Treated like any failure: the student is told, and no detail is shown.
      setProblem(MESSAGES.failed);
    }
    setPending(false);
  }

  const label = pending ? "Saving" : following ? "Stop following" : "Follow this program";
  return (
    <>
      {following && (
        <p className="save-state" role="status" tabIndex={-1} ref={statusRef}>
          <span>You follow this program</span>
        </p>
      )}
      <button
        type="button"
        className="detail-save"
        disabled={pending}
        ref={following ? undefined : followRef}
        onClick={() => void change()}
      >
        {label}
      </button>
      {problem !== null && (
        <p role="alert" className="field-problem">
          {problem}
        </p>
      )}
    </>
  );
}
