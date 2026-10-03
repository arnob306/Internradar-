const MELBOURNE = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Melbourne",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * The Melbourne calendar date of an instant, as `YYYY-MM-DD` (ADR-015). Never take the date from
 * `toISOString()`: between 10am and midnight UTC it is still yesterday in Melbourne's morning, and
 * the offset moves with daylight saving.
 */
export function melbourneDate(instant: Date): string {
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError("invalid date");
  }
  const parts = Object.fromEntries(
    MELBOURNE.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  return `${parts["year"]}-${parts["month"]}-${parts["day"]}`;
}
