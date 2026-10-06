import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { ProfileForm } from "../../components/ProfileForm";
import { melbourneDate } from "../../features/programs/melbourne-date";
import { parseProfileInput, type ProfileInput } from "../../features/profile/profile-input";
import { sessionClientForRequest } from "../../server/auth/request-session";
import { logFailure } from "../../server/log";
import { loadProfile } from "../../server/profile/profile-repo";

export const metadata: Metadata = { title: "Your profile" };

// A student's own page, built from their session on every request.
export const dynamic = "force-dynamic";

function emptyProfile(): ProfileInput {
  const parsed = parseProfileInput({});
  if (!parsed.ok) {
    throw new Error("the empty profile must always be valid");
  }
  return parsed.value;
}

export default async function ProfilePage(): Promise<ReactElement> {
  const client = await sessionClientForRequest();
  // The proxy already sends visitors away; this makes the page safe even if it is ever skipped.
  const { data } = await client.auth.getUser();
  if (data.user === null) {
    redirect("/login?next=%2Fprofile");
  }

  let profile: ProfileInput | null;
  let failed = false;
  try {
    profile = await loadProfile(client);
  } catch (error) {
    logFailure("page.profile.load", error);
    profile = null;
    failed = true;
  }

  return (
    <main className="page profile">
      <h1 className="login-title">Your profile</h1>
      <p className="login-lede muted">
        This is used to check which programs you can apply for. You can leave anything blank, and we&apos;ll say
        &ldquo;Check requirements&rdquo; where we can&apos;t tell.
      </p>
      {failed ? (
        <p className="notice">We couldn&apos;t load your profile right now. Please try again in a moment.</p>
      ) : (
        <ProfileForm
          initial={profile ?? emptyProfile()}
          currentYear={Number(melbourneDate(new Date()).slice(0, 4))}
        />
      )}
    </main>
  );
}
