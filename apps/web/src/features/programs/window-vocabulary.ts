/** Whether applications are open. One list, so the types, the page and the written API spec cannot drift apart. */
export const WINDOW_STATUSES = ["open", "upcoming", "closed", "unknown"] as const;
export type WindowStatus = (typeof WINDOW_STATUSES)[number];

/** How exactly a source proves a date: the day, only the month, or a guess from earlier years. */
export const DATE_PRECISIONS = ["day", "month", "estimated"] as const;
export type DatePrecision = (typeof DATE_PRECISIONS)[number];
