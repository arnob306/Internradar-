import { isApplicationStatus, type ApplicationStatus, type FieldError } from "@internradar/domain";

/** What a student may change about an application they already have. Only sent fields appear. */
export interface ApplicationPatch {
  readonly status?: ApplicationStatus;
  readonly notes?: string | null;
  readonly resumeId?: string | null;
}

export interface SaveInput {
  readonly programId: string;
}

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly fields: readonly FieldError[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NOTES_LENGTH = 2000;
const PATCH_KEYS: ReadonlySet<string> = new Set(["status", "notes", "resumeId"]);
const SAVE_KEYS: ReadonlySet<string> = new Set(["programId"]);

type Raw = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

// Notes are free text, so line breaks and tabs are fine; every other control character is not.
function hasUnwantedControlCharacters(text: string): boolean {
  return [...text].some((character) => {
    const code = character.charCodeAt(0);
    return (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) || code === 0x7f;
  });
}

function unknownKeys(body: Raw, allowed: ReadonlySet<string>): FieldError[] {
  return Object.keys(body)
    .filter((key) => !allowed.has(key))
    .map((key) => ({ field: key, message: `Unknown field "${key}".` }));
}

/** A path segment that names an application: a uuid, or null. Never reaches the database otherwise. */
export function parseApplicationId(segment: string): string | null {
  return UUID.test(segment) ? segment : null;
}

/**
 * Validate the body of "save this program". Only the program is the student's choice; who they
 * are, which intake it is, and the status all come from the server.
 */
export function parseSaveInput(body: unknown): ParseResult<SaveInput> {
  if (!isRecord(body)) {
    return { ok: false, fields: [{ field: "body", message: "The request must be a JSON object." }] };
  }
  const errors = unknownKeys(body, SAVE_KEYS);
  const programId = body["programId"];
  if (!isUuid(programId)) {
    errors.push({ field: "programId", message: "programId must be the id of a program." });
    return { ok: false, fields: errors };
  }
  return errors.length > 0 ? { ok: false, fields: errors } : { ok: true, value: { programId } };
}

function notesFrom(value: unknown, errors: FieldError[]): string | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string" || hasUnwantedControlCharacters(value) || value.trim().length > MAX_NOTES_LENGTH) {
    errors.push({ field: "notes", message: `notes must be plain text of at most ${MAX_NOTES_LENGTH} characters.` });
    return undefined;
  }
  return value.trim() === "" ? null : value.trim();
}

/**
 * Validate a change to an application. Whether a status move is allowed is the domain's call, made
 * against the stored status; this only checks the request is well formed. Unknown keys are refused,
 * including `user_id` and `applied_at`, which the server sets.
 */
export function parseApplicationPatch(body: unknown): ParseResult<ApplicationPatch> {
  if (!isRecord(body)) {
    return { ok: false, fields: [{ field: "body", message: "The request must be a JSON object." }] };
  }
  const errors = unknownKeys(body, PATCH_KEYS);
  let patch: ApplicationPatch = {};

  if ("status" in body) {
    if (isApplicationStatus(body["status"])) {
      patch = { ...patch, status: body["status"] };
    } else {
      errors.push({ field: "status", message: "status is not a recognised application status." });
    }
  }
  if ("notes" in body) {
    const notes = notesFrom(body["notes"], errors);
    if (notes !== undefined) {
      patch = { ...patch, notes };
    }
  }
  if ("resumeId" in body) {
    if (body["resumeId"] === null || isUuid(body["resumeId"])) {
      patch = { ...patch, resumeId: body["resumeId"] };
    } else {
      errors.push({ field: "resumeId", message: "resumeId must be the id of one of your resumes, or null." });
    }
  }

  if (errors.length > 0) {
    return { ok: false, fields: errors };
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, fields: [{ field: "body", message: "Send at least one of: status, notes, resumeId." }] };
  }
  return { ok: true, value: patch };
}
