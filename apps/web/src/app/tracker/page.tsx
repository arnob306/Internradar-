import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { TrackerBoard } from "../../components/TrackerBoard";
import { listApplications } from "../../server/applications/applications-repo";
import { sessionClientForRequest } from "../../server/auth/request-session";
import { logFailure } from "../../server/log";

export const metadata: Metadata = { title: "Your tracker" };

// A student's own page, built from their session on every request.
export const dynamic = "force-dynamic";

export default async function TrackerPage(): Promise<ReactElement> {
  const client = await sessionClientForRequest();
  // The proxy already sends visitors away; this makes the page safe even if it is ever skipped.
  const { data } = await client.auth.getUser();
  if (data.user === null) {
    redirect("/login?next=%2Ftracker");
  }

  let applications: Awaited<ReturnType<typeof listApplications>> | null = null;
  try {
    applications = await listApplications(client);
  } catch (error) {
    logFailure("page.tracker.load", error);
  }

  return (
    <main className="page tracker">
      <h1 className="login-title">Your tracker</h1>
      <p className="login-lede muted">Programs you&apos;ve saved, and where each one stands.</p>
      {applications === null ? (
        <p className="notice">We couldn&apos;t load your tracker right now. Please try again in a moment.</p>
      ) : (
        <TrackerBoard initial={applications} />
      )}
    </main>
  );
}
