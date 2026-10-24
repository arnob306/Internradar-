"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";

const MESSAGES = {
  rateLimited: "You're asking too quickly. Wait a minute, then try again.",
  failed: "We couldn't stop the emails. Try again in a moment.",
} as const;

interface UnsubscribeButtonProps {
  readonly alertId: string;
}

type Status = "idle" | "stopping" | "done";

export function UnsubscribeButton({ alertId }: UnsubscribeButtonProps): ReactElement {
  const [status, setStatus] = useState<Status>("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const doneRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (status === "done") {
      doneRef.current?.focus();
    }
  }, [status]);

  async function stop(): Promise<void> {
    if (status !== "idle") {
      return;
    }
    setStatus("stopping");
    setProblem(null);
    try {
      const response = await fetch(`/api/v1/alerts/unsubscribe?alert=${alertId}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      });
      if (response.ok) {
        setStatus("done");
        return;
      }
      setProblem(response.status === 429 ? MESSAGES.rateLimited : MESSAGES.failed);
    } catch {
      // Treated like any failure: the student is told, and no detail is shown.
      setProblem(MESSAGES.failed);
    }
    setStatus("idle");
  }

  if (status === "done") {
    return (
      <p className="save-state" role="status" tabIndex={-1} ref={doneRef}>
        You will no longer get alert emails.
      </p>
    );
  }
  return (
    <>
      <button type="button" className="detail-save" disabled={status === "stopping"} onClick={() => void stop()}>
        {status === "stopping" ? "Stopping" : "Stop alert emails"}
      </button>
      {problem !== null && (
        <p role="alert" className="field-problem">
          {problem}
        </p>
      )}
    </>
  );
}
