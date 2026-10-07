import {
  fail,
  ok,
  transition,
  undoTarget,
  type ApplicationStatus,
  type FieldError,
  type StatusChange,
} from "@internradar/domain";
import {
  parseApplicationId,
  parseApplicationPatch,
  parseSaveInput,
  type ApplicationPatch,
} from "../../features/applications/application-input";
import { guardMutation } from "../guard-mutation";
import { logFailure } from "../log";

/** One application as the API shows it: the student's own record plus enough to name the program. */
export interface ApplicationRecord {
  readonly id: string;
  readonly programId: string;
  readonly programSlug: string;
  readonly programName: string;
  readonly companySlug: string;
  readonly companyName: string;
  readonly cycleYear: number;
  readonly status: ApplicationStatus;
  readonly appliedAt: string | null;
  readonly notes: string | null;
  readonly resumeId: string | null;
  readonly updatedAt: string;
  /** Whether the last status move can be undone: false for a new save and after an undo. */
  readonly canUndo: boolean;
}

/** What the server may change in one step. `appliedAt` is set by the server, never the client. */
export interface ApplicationChange {
  readonly status?: ApplicationStatus;
  readonly appliedAt?: string;
  readonly notes?: string | null;
  readonly resumeId?: string | null;
}

export interface ApplicationsHandlerDeps {
  /** Who is asking, from the session cookie. Null for a visitor. Never taken from the request. */
  readonly getUserId: () => Promise<string | null>;
  /** False once this student has changed things too often in the current window. */
  readonly allowWrite: () => Promise<boolean>;
  readonly list: () => Promise<readonly ApplicationRecord[]>;
  /** Null when the program does not exist or is not published. */
  readonly save: (
    userId: string,
    programId: string,
  ) => Promise<{ readonly record: ApplicationRecord; readonly created: boolean } | null>;
  /** Only the signed-in student's own applications are ever visible. */
  readonly find: (id: string) => Promise<ApplicationRecord | null>;
  readonly latestChange: (id: string) => Promise<StatusChange | null>;
  /** Applies the change only while the application still has `expectedStatus`; null if it did not. */
  readonly update: (
    id: string,
    change: ApplicationChange,
    expectedStatus: ApplicationStatus,
  ) => Promise<ApplicationRecord | null>;
  readonly remove: (id: string) => Promise<boolean>;
  readonly now: () => Date;
  /** Where failures are recorded. Defaults to the safe server logger; tests pass a spy. */
  readonly log?: (scope: string, error: unknown) => void;
}

type Handler = (request: Request) => Promise<Response>;
type ItemHandler = (request: Request, id: string) => Promise<Response>;

// A save or a change is a few hundred bytes. Anything far bigger is not one.
const MAX_BODY_CHARACTERS = 8192;
// An application is one student's private record, so no cache may keep a copy.
const PRIVATE = "private, no-store";

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": PRIVATE, ...headers },
  });
}

const unauthenticated = (): Response => json(fail("UNAUTHENTICATED", "Sign in to continue."), 401);
const notFound = (): Response => json(fail("NOT_FOUND", "We couldn't find that application."), 404);
const conflict = (): Response =>
  json(fail("CONFLICT", "This application changed in the meantime. Reload and try again."), 409);
const generic = (): Response => json(fail("INTERNAL_ERROR", "Something went wrong. Please try again."), 500);
const invalid = (fields: readonly FieldError[]): Response =>
  json(fail("VALIDATION_ERROR", "Some fields are not valid.", fields), 400);

function tooFast(): Response {
  return json(fail("RATE_LIMITED", "You are changing things too quickly. Please wait a minute and try again."), 429, {
    "retry-after": "60",
  });
}

/** The JSON body of a request, or the 400 to send when it is too big or not JSON. */
async function readBody(request: Request): Promise<{ body: unknown } | { refusal: Response }> {
  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARACTERS) {
    return { refusal: invalid([{ field: "body", message: "The request is too large." }]) };
  }
  try {
    return { body: JSON.parse(raw) as unknown };
  } catch {
    return { refusal: invalid([{ field: "body", message: "The request must be valid JSON." }]) };
  }
}

/** What to write for a patch: the status move (if any) plus the day the student first applied. */
function changeFor(current: ApplicationRecord, patch: ApplicationPatch, now: Date): ApplicationChange | Response {
  if (patch.status === undefined) {
    return patch;
  }
  const move = transition(current.status, patch.status);
  if (!move.ok) {
    const message =
      move.code === "SAME_STATUS"
        ? "The application is already at that status."
        : "That move isn't allowed from the current status.";
    return json(fail("INVALID_TRANSITION", message), 409);
  }
  // Applying is the one move that needs a date; the server's clock supplies it. Rejecting a program
  // that was only saved never involved an application, so it has none.
  const startsApplication = current.status === "saved" && patch.status !== "rejected";
  return startsApplication ? { ...patch, appliedAt: now.toISOString() } : patch;
}

/**
 * The handlers for /api/v1/me/applications. Who the application belongs to always comes from the
 * session, never from the request, and the database's row-level security means a student can only
 * ever see or change their own. For a write the order is: where it came from, who is asking,
 * whether they are changing things too often, and only then the target and the body.
 */
export function createApplicationHandlers(deps: ApplicationsHandlerDeps): {
  list: Handler;
  create: Handler;
  get: ItemHandler;
  patch: ItemHandler;
  undo: ItemHandler;
  remove: ItemHandler;
} {
  const record = deps.log ?? logFailure;

  /** The checks every write makes, in order. Returns the refusal and the student, or the refusal alone. */
  async function beforeWrite(request: Request): Promise<{ refusal: Response } | { userId: string }> {
    const refusal = guardMutation(request);
    if (refusal !== null) {
      return { refusal };
    }
    const userId = await deps.getUserId();
    if (userId === null) {
      return { refusal: unauthenticated() };
    }
    return (await deps.allowWrite()) ? { userId } : { refusal: tooFast() };
  }

  return {
    list: async () => {
      if ((await deps.getUserId()) === null) {
        return unauthenticated();
      }
      try {
        return json(ok(await deps.list()), 200);
      } catch (error) {
        record("api.applications.list", error);
        return generic();
      }
    },

    create: async (request) => {
      const checked = await beforeWrite(request);
      if ("refusal" in checked) {
        return checked.refusal;
      }
      const read = await readBody(request);
      if ("refusal" in read) {
        return read.refusal;
      }
      const parsed = parseSaveInput(read.body);
      if (!parsed.ok) {
        return invalid(parsed.fields);
      }
      try {
        const saved = await deps.save(checked.userId, parsed.value.programId);
        if (saved === null) {
          return json(fail("PROGRAM_NOT_FOUND", "We couldn't find that program."), 404);
        }
        return saved.created
          ? json(ok(saved.record), 201, { location: `/api/v1/me/applications/${saved.record.id}` })
          : json(ok(saved.record), 200);
      } catch (error) {
        record("api.applications.save", error);
        return generic();
      }
    },

    get: async (_request, rawId) => {
      if ((await deps.getUserId()) === null) {
        return unauthenticated();
      }
      const id = parseApplicationId(rawId);
      if (id === null) {
        return notFound();
      }
      try {
        const found = await deps.find(id);
        return found === null ? notFound() : json(ok(found), 200);
      } catch (error) {
        record("api.applications.get", error);
        return generic();
      }
    },

    patch: async (request, rawId) => {
      const checked = await beforeWrite(request);
      if ("refusal" in checked) {
        return checked.refusal;
      }
      const id = parseApplicationId(rawId);
      if (id === null) {
        return notFound();
      }
      const read = await readBody(request);
      if ("refusal" in read) {
        return read.refusal;
      }
      const parsed = parseApplicationPatch(read.body);
      if (!parsed.ok) {
        return invalid(parsed.fields);
      }
      try {
        const current = await deps.find(id);
        if (current === null) {
          return notFound();
        }
        const change = changeFor(current, parsed.value, deps.now());
        if (change instanceof Response) {
          return change;
        }
        const updated = await deps.update(id, change, current.status);
        return updated === null ? conflict() : json(ok(updated), 200);
      } catch (error) {
        record("api.applications.update", error);
        return generic();
      }
    },

    undo: async (request, rawId) => {
      const checked = await beforeWrite(request);
      if ("refusal" in checked) {
        return checked.refusal;
      }
      const id = parseApplicationId(rawId);
      if (id === null) {
        return notFound();
      }
      try {
        const current = await deps.find(id);
        if (current === null) {
          return notFound();
        }
        const target = undoTarget(await deps.latestChange(id));
        if (target === null) {
          return json(fail("NOTHING_TO_UNDO", "There is no earlier status to go back to."), 409);
        }
        const updated = await deps.update(id, { status: target }, current.status);
        return updated === null ? conflict() : json(ok(updated), 200);
      } catch (error) {
        record("api.applications.undo", error);
        return generic();
      }
    },

    remove: async (request, rawId) => {
      const checked = await beforeWrite(request);
      if ("refusal" in checked) {
        return checked.refusal;
      }
      const id = parseApplicationId(rawId);
      if (id === null) {
        return notFound();
      }
      try {
        return (await deps.remove(id))
          ? new Response(null, { status: 204, headers: { "cache-control": PRIVATE } })
          : notFound();
      } catch (error) {
        record("api.applications.remove", error);
        return generic();
      }
    },
  };
}
