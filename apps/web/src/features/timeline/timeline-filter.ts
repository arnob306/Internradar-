import type { ProgramType } from "@internradar/domain";

/** The program types the timeline lets a student narrow to. */
export type TimelineType = Extract<ProgramType, "graduate" | "vacationer">;

export interface TimelineFilter {
  readonly type: TimelineType | undefined;
  /** False when the address held a type this page does not offer, so the page can say it was ignored. */
  readonly isValid: boolean;
}

export const TIMELINE_FILTERS: readonly { readonly type: TimelineType | undefined; readonly label: string }[] = [
  { type: undefined, label: "All programs" },
  { type: "graduate", label: "Graduate" },
  { type: "vacationer", label: "Vacationer" },
];

function isTimelineType(value: string): value is TimelineType {
  return TIMELINE_FILTERS.some((filter) => filter.type === value);
}

/**
 * Read the one filter the home timeline has. Other parameters are left alone, so a shared link with
 * tracking codes still works. A type that is repeated, empty or not offered is ignored and reported.
 */
export function parseTimelineFilter(params: URLSearchParams): TimelineFilter {
  const values = params.getAll("type");
  if (values.length === 0) {
    return { type: undefined, isValid: true };
  }
  const [value] = values;
  if (values.length === 1 && value !== undefined && isTimelineType(value)) {
    return { type: value, isValid: true };
  }
  return { type: undefined, isValid: false };
}

/** Where the timeline lives with a type chosen: the home page, or the home page with `?type=`. */
export function timelineHref(type: TimelineType | undefined): string {
  return type === undefined ? "/" : `/?type=${type}`;
}
