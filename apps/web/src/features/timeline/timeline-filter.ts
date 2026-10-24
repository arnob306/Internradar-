import { INDUSTRIES, isIndustry, type Industry, type ProgramType } from "@internradar/domain";
import { INDUSTRY_LABELS } from "../vocabulary-labels";

/** The program types the timeline lets a student narrow to. */
export type TimelineType = Extract<ProgramType, "graduate" | "vacationer">;

export interface TimelineFilter {
  readonly type: TimelineType | undefined;
  readonly industry: Industry | undefined;
  /** False when the address held a filter this page does not offer, so the page can say it was ignored. */
  readonly isValid: boolean;
}

export const TIMELINE_FILTERS: readonly { readonly type: TimelineType | undefined; readonly label: string }[] = [
  { type: undefined, label: "All programs" },
  { type: "graduate", label: "Graduate" },
  { type: "vacationer", label: "Vacationer" },
];

/** All industries first, then each one by its plain label, in the order the database lists them. */
export const INDUSTRY_FILTERS: readonly { readonly industry: Industry | undefined; readonly label: string }[] = [
  { industry: undefined, label: "All industries" },
  ...INDUSTRIES.map((industry) => ({ industry, label: INDUSTRY_LABELS[industry] })),
];

function isTimelineType(value: string): value is TimelineType {
  return TIMELINE_FILTERS.some((filter) => filter.type === value);
}

/** The one value a filter may have, or undefined and "not valid" when it is repeated, empty or not offered. */
function single<T extends string>(
  params: URLSearchParams,
  key: string,
  accepts: (value: string) => value is T,
): { readonly value: T | undefined; readonly isValid: boolean } {
  const values = params.getAll(key);
  if (values.length === 0) {
    return { value: undefined, isValid: true };
  }
  const [value] = values;
  if (values.length === 1 && value !== undefined && accepts(value)) {
    return { value, isValid: true };
  }
  return { value: undefined, isValid: false };
}

/**
 * Read the two filters the home timeline has. Other parameters are left alone, so a shared link with
 * tracking codes still works. A filter that is repeated, empty or not offered is ignored and reported,
 * and the other filter still applies.
 */
export function parseTimelineFilter(params: URLSearchParams): TimelineFilter {
  const type = single(params, "type", isTimelineType);
  const industry = single(params, "industry", isIndustry);
  return { type: type.value, industry: industry.value, isValid: type.isValid && industry.isValid };
}

/** Where the timeline lives with filters chosen: the home page, then `?type=` and `industry=` as needed. */
export function timelineHref(type: TimelineType | undefined, industry?: Industry): string {
  const params = new URLSearchParams();
  if (type !== undefined) {
    params.set("type", type);
  }
  if (industry !== undefined) {
    params.set("industry", industry);
  }
  const text = params.toString();
  return text === "" ? "/" : `/?${text}`;
}
