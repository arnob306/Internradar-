"use client";

import { useId, useState, type FormEvent, type ReactElement } from "react";

type Phase = "typing" | "sending" | "sent";

const NOTICES: Readonly<Record<string, string>> = {
  invalid_link: "That link has expired or was already used. Request a new one.",
};

const MESSAGES = {
  invalidEmail: "Enter a valid email address, like name@university.edu.au.",
  rateLimited: "Too many emails sent. Wait a minute, then try again.",
  failed: "We couldn't send the email. Try again in a moment.",
} as const;

interface LoginFormProps {
  /** An on-site path to continue to after signing in. The server checks it again. */
  readonly next: string;
  /** A code for why the student was sent back here. Unknown codes are ignored, never shown. */
  readonly notice?: string | undefined;
}

export function LoginForm({ next, notice }: LoginFormProps): ReactElement {
  const [phase, setPhase] = useState<Phase>("typing");
  const [email, setEmail] = useState("");
  const [problem, setProblem] = useState<string | null>(notice === undefined ? null : (NOTICES[notice] ?? null));
  const [fieldProblem, setFieldProblem] = useState(false);
  const problemId = useId();

  async function send(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (phase === "sending") {
      return;
    }
    setPhase("sending");
    setProblem(null);
    setFieldProblem(false);
    try {
      const response = await fetch("/api/v1/auth/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, next }),
      });
      if (response.ok) {
        setPhase("sent");
        return;
      }
      setPhase("typing");
      if (response.status === 400) {
        setFieldProblem(true);
        setProblem(MESSAGES.invalidEmail);
      } else {
        setProblem(response.status === 429 ? MESSAGES.rateLimited : MESSAGES.failed);
      }
    } catch {
      setPhase("typing");
      setProblem(MESSAGES.failed);
    }
  }

  if (phase === "sent") {
    return (
      <div className="login-sent" role="status">
        <span className="login-ring" aria-hidden="true" />
        <h2>Check your inbox</h2>
        <p>
          We sent a sign-in link to <strong>{email}</strong>. It works once and expires in an hour.
        </p>
        <button type="button" className="login-link" onClick={() => setPhase("typing")}>
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form className="login-form" onSubmit={send} noValidate>
      <label htmlFor="login-email">Email address</label>
      <input
        id="login-email"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        aria-invalid={fieldProblem ? true : undefined}
        aria-describedby={problem === null ? undefined : problemId}
      />
      {problem !== null && (
        <p id={problemId} className="login-problem" role="alert">
          {problem}
        </p>
      )}
      <button type="submit" className="login-submit" disabled={phase === "sending"}>
        {phase === "sending" ? "Sending" : "Email me a link"}
      </button>
      <p className="login-hint muted">No password to remember. The link signs you in once.</p>
    </form>
  );
}
