import { fail, ok, type FieldError } from "@internradar/domain";
import { parseProfileInput, type ProfileInput } from "../../features/profile/profile-input";
import { guardMutation } from "../guard-mutation";
import { logFailure } from "../log";

export interface ProfileHandlerDeps {
  /** Who is asking, from the session cookie. Null for a visitor. Never taken from the request. */
  readonly getUserId: () => Promise<string | null>;
  readonly load: () => Promise<ProfileInput | null>;
  readonly save: (userId: string, input: ProfileInput) => Promise<void>;
  /** False once this student has saved too often in the current window. */
  readonly allowWrite: () => Promise<boolean>;
  /** Where failures are recorded. Defaults to the safe server logger; tests pass a spy. */
  readonly log?: (scope: string, error: unknown) => void;
}

// A profile is a few hundred bytes. Anything far bigger is not one.
const MAX_BODY_CHARACTERS = 8192;
// This is a student's own details, so it is private to them and no cache may keep a copy.
const PRIVATE = "private, no-store";

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": PRIVATE, ...headers },
  });
}

function unauthenticated(): Response {
  return json(fail("UNAUTHENTICATED", "Sign in to continue."), 401);
}

function invalid(fields: readonly FieldError[]): Response {
  return json(fail("VALIDATION_ERROR", "Some profile fields are not valid.", fields), 400);
}

/** What a student who has told us nothing yet looks like: all empty, alerts on. */
function emptyProfile(): ProfileInput {
  const parsed = parseProfileInput({});
  if (!parsed.ok) {
    throw new Error("the empty profile must always be valid");
  }
  return parsed.value;
}

/**
 * GET and PUT /api/v1/me/profile. Who the profile belongs to always comes from the session, never
 * from the request, and a user_id in the body is refused. For a write the order is: where it came
 * from, who is asking, whether they are saving too often, and only then the body.
 */
export function createProfileHandlers(deps: ProfileHandlerDeps): {
  GET: (request: Request) => Promise<Response>;
  PUT: (request: Request) => Promise<Response>;
} {
  const record = deps.log ?? logFailure;

  return {
    GET: async () => {
      if ((await deps.getUserId()) === null) {
        return unauthenticated();
      }
      try {
        return json(ok((await deps.load()) ?? emptyProfile()), 200);
      } catch (error) {
        record("api.profile.load", error);
        return json(fail("INTERNAL_ERROR", "Something went wrong. Please try again."), 500);
      }
    },

    PUT: async (request) => {
      const refusal = guardMutation(request);
      if (refusal !== null) {
        return refusal;
      }
      const userId = await deps.getUserId();
      if (userId === null) {
        return unauthenticated();
      }
      if (!(await deps.allowWrite())) {
        return json(
          fail("RATE_LIMITED", "You are saving too quickly. Please wait a minute and try again."),
          429,
          { "retry-after": "60" },
        );
      }

      const raw = await request.text();
      if (raw.length > MAX_BODY_CHARACTERS) {
        return invalid([{ field: "body", message: "The profile is too large." }]);
      }
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        return invalid([{ field: "body", message: "The profile must be valid JSON." }]);
      }

      const parsed = parseProfileInput(body);
      if (!parsed.ok) {
        return invalid(parsed.fields);
      }

      try {
        await deps.save(userId, parsed.value);
        return json(ok(parsed.value), 200);
      } catch (error) {
        // Only a safe summary is logged: never the profile, whose citizenship is sensitive.
        record("api.profile.save", error);
        return json(fail("INTERNAL_ERROR", "Something went wrong. Please try again."), 500);
      }
    },
  };
}
