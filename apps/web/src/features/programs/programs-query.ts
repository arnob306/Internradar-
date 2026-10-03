import { isDiscipline, type Discipline, type FieldError, type ProgramType } from "@internradar/domain";

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/** The database enum, as a runtime list. `satisfies` keeps it in step with the domain type. */
export const PROGRAM_TYPES = [
  "internship",
  "vacationer",
  "graduate",
  "cadetship",
  "discovery",
] as const satisfies readonly ProgramType[];

export interface ProgramsQuery {
  readonly limit: number;
  readonly offset: number;
  readonly type: ProgramType | undefined;
  readonly discipline: Discipline | undefined;
  readonly openNow: boolean;
}

export type ProgramsQueryResult =
  | { readonly ok: true; readonly value: ProgramsQuery }
  | { readonly ok: false; readonly fields: readonly FieldError[] };

const ALLOWED_KEYS: ReadonlySet<string> = new Set([
  "limit",
  "offset",
  "type",
  "discipline",
  "openNow",
]);

const WHOLE_NUMBER = /^\d+$/;

function isProgramType(value: string): value is ProgramType {
  return (PROGRAM_TYPES as readonly string[]).includes(value);
}

/**
 * Validate the query string of GET /api/v1/programs. Unknown keys and repeated keys are
 * rejected rather than ignored, so a typo like `limt=5` never silently does nothing, and every
 * problem is reported at once.
 */
export function parseProgramsQuery(params: URLSearchParams): ProgramsQueryResult {
  const errors: FieldError[] = [];
  const fail = (field: string, message: string): void => {
    errors.push({ field, message });
  };

  const seen = new Set<string>();
  for (const key of params.keys()) {
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    if (!ALLOWED_KEYS.has(key)) {
      fail(key, `Unknown query parameter "${key}".`);
    } else if (params.getAll(key).length > 1) {
      fail(key, `"${key}" can only be given once.`);
    }
  }
  const usable = (key: string): string | undefined =>
    errors.some((error) => error.field === key) ? undefined : (params.get(key) ?? undefined);

  let limit = DEFAULT_LIMIT;
  let limitIsValid = true;
  const rawLimit = usable("limit");
  if (rawLimit !== undefined) {
    if (WHOLE_NUMBER.test(rawLimit) && Number(rawLimit) >= 1 && Number(rawLimit) <= MAX_LIMIT) {
      limit = Number(rawLimit);
    } else {
      limitIsValid = false;
      fail("limit", `limit must be a whole number from 1 to ${MAX_LIMIT}.`);
    }
  }

  let offset = 0;
  const rawOffset = usable("offset");
  if (rawOffset !== undefined) {
    if (!WHOLE_NUMBER.test(rawOffset)) {
      fail("offset", "offset must be a whole number, 0 or more.");
    } else if (limitIsValid && Number(rawOffset) % limit !== 0) {
      // Pages are `limit` rows each, so an offset between two pages would be reported as
      // "page 1" while starting mid-page. The feed's own links never produce one. With an
      // invalid limit there are no pages to measure against, so only the limit is reported.
      fail("offset", `offset must be a multiple of limit (${limit}), so it starts a page.`);
    } else {
      offset = Number(rawOffset);
    }
  }

  let type: ProgramType | undefined;
  const rawType = usable("type");
  if (rawType !== undefined) {
    if (isProgramType(rawType)) {
      type = rawType;
    } else {
      fail("type", `type must be one of: ${PROGRAM_TYPES.join(", ")}.`);
    }
  }

  let discipline: Discipline | undefined;
  const rawDiscipline = usable("discipline");
  if (rawDiscipline !== undefined) {
    if (isDiscipline(rawDiscipline)) {
      discipline = rawDiscipline;
    } else {
      fail("discipline", "discipline is not a recognised degree area.");
    }
  }

  let openNow = false;
  const rawOpenNow = usable("openNow");
  if (rawOpenNow !== undefined) {
    if (rawOpenNow === "true" || rawOpenNow === "false") {
      openNow = rawOpenNow === "true";
    } else {
      fail("openNow", "openNow must be true or false.");
    }
  }

  return errors.length > 0
    ? { ok: false, fields: errors }
    : { ok: true, value: { limit, offset, type, discipline, openNow } };
}
