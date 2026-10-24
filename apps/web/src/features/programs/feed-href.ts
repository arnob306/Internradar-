import { DEFAULT_LIMIT, type ProgramsQuery } from "./programs-query";

export type FeedChange = Partial<Pick<ProgramsQuery, "type" | "discipline" | "industry" | "openNow" | "offset">>;

/** Where the feed of programs lives: the home page is the timeline. */
const FEED_PATH = "/programs";

const FILTERS = ["type", "discipline", "industry", "openNow"] as const;

/**
 * The URL of the feed with one thing changed. Filters already chosen are kept; changing a filter
 * goes back to the first page, because page 3 of a different list means nothing. Anything at its
 * default is left out, so the unfiltered feed is just "/programs".
 */
export function feedHref(query: ProgramsQuery, change: FeedChange): string {
  const filterChanged = FILTERS.some((key) => key in change);
  const type = "type" in change ? change.type : query.type;
  const discipline = "discipline" in change ? change.discipline : query.discipline;
  const industry = "industry" in change ? change.industry : query.industry;
  const openNow = "openNow" in change ? change.openNow : query.openNow;
  const offset = "offset" in change ? change.offset : filterChanged ? 0 : query.offset;

  const params = new URLSearchParams();
  if (type !== undefined) {
    params.set("type", type);
  }
  if (discipline !== undefined) {
    params.set("discipline", discipline);
  }
  if (industry !== undefined) {
    params.set("industry", industry);
  }
  if (openNow === true) {
    params.set("openNow", "true");
  }
  if (query.limit !== DEFAULT_LIMIT) {
    params.set("limit", String(query.limit));
  }
  if (offset !== undefined && offset > 0) {
    params.set("offset", String(offset));
  }
  const text = params.toString();
  return text === "" ? FEED_PATH : `${FEED_PATH}?${text}`;
}
