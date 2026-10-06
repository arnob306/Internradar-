import type { SupabaseClient } from "@supabase/supabase-js";
import type { CardEligibility } from "../../components/ProgramCard";
import { eligibilityForFeed } from "../../features/programs/feed-eligibility";
import type { Database } from "../db/database.types";
import { logFailure } from "../log";
import { loadProfile } from "../profile/profile-repo";
import { toStudentProfile } from "../profile/profile-row";
import type { ProgramListItem } from "./list-programs";

export interface Viewer {
  /** An answer for each program, once the student is signed in and has a profile. */
  readonly eligibility?: Record<string, CardEligibility>;
  /** What each card asks for while it has no answer. */
  readonly prompt: "sign-in" | "profile";
}

/**
 * What this visitor can be told about each program. A visitor is asked to sign in; a student with
 * no profile is asked to add one; one with a profile gets the engine's answer. If the session or
 * the profile cannot be read, the programs still show and the page simply asks again: a lookup
 * that fails must never take a page down, or be mistaken for an answer.
 */
export async function viewerFor(
  client: SupabaseClient<Database>,
  items: readonly ProgramListItem[],
  today: string,
): Promise<Viewer> {
  let signedIn = false;
  try {
    signedIn = (await client.auth.getUser()).data.user !== null;
  } catch (error) {
    logFailure("page.home.session", error);
  }
  if (!signedIn) {
    return { prompt: "sign-in" };
  }

  try {
    const profile = await loadProfile(client);
    if (profile === null) {
      return { prompt: "profile" };
    }
    return { prompt: "profile", eligibility: eligibilityForFeed(items, toStudentProfile(profile), today) };
  } catch (error) {
    logFailure("page.home.profile", error);
    return { prompt: "profile" };
  }
}
