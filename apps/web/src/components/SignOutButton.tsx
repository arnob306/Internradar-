"use client";

import { useState, type ReactElement } from "react";

interface SignOutButtonProps {
  /** Where to go once signed out. Defaults to a full page load of the home page. */
  readonly onSignedOut?: () => void;
}

function goHome(): void {
  // A full load, not a client-side navigation, so nothing from the old session lingers on screen.
  window.location.assign("/");
}

export function SignOutButton({ onSignedOut = goHome }: SignOutButtonProps): ReactElement {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut(): Promise<void> {
    if (busy) {
      return;
    }
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch("/api/v1/auth/sign-out", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (response.ok) {
        onSignedOut();
        return;
      }
    } catch {
      // Treated the same as a refusal: the student is told, and no detail is shown.
    }
    setBusy(false);
    setFailed(true);
  }

  return (
    <>
      <button type="button" className="header-button" disabled={busy} onClick={() => void signOut()}>
        {busy ? "Signing out" : "Sign out"}
      </button>
      {failed && (
        <span role="alert" className="header-problem">
          We couldn&apos;t sign you out. Try again.
        </span>
      )}
    </>
  );
}
