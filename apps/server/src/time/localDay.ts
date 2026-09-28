/**
 * Formatters are expensive to build and there are at most a handful of zones
 * in play, so they are built once and kept.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

function _formatterFor(timezone: string): Intl.DateTimeFormat {
  const existing = formatters.get(timezone);
  if (existing !== undefined) {
    return existing;
  }
  // `en-CA` formats a date as `YYYY-MM-DD`, which is the form the schema and
  // the contract both use for a calendar date.
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  formatters.set(timezone, formatter);
  return formatter;
}

/**
 * The calendar day an instant fell on, in one IANA zone, as `YYYY-MM-DD`.
 *
 * SQLite has no zone database, so every day boundary in the product resolves
 * here instead: the day a photograph lands on, the activity log's day, and the
 * removal reminder's week (`data-models.md` § `settings`, Decision 10).
 *
 * @param instant An ISO-8601 instant.
 * @param timezone An IANA zone, from `shoebox.timezone`.
 */
export function toLocalDay(instant: string, timezone: string): string {
  return _formatterFor(timezone).format(new Date(instant));
}

/**
 * Whole calendar days from one instant to another, in one zone.
 *
 * Calendar days rather than elapsed hours, which is the difference that makes
 * `removal-reminder`'s week boundary land at local midnight rather than at
 * whatever time of day somebody happened to ask. Negative when `to` is before
 * `from`.
 */
export function countLocalDaysBetween(options: {
  from: string;
  to: string;
  timezone: string;
}): number {
  const fromDay = Date.parse(
    `${toLocalDay(options.from, options.timezone)}T00:00:00Z`,
  );
  const toDay = Date.parse(
    `${toLocalDay(options.to, options.timezone)}T00:00:00Z`,
  );
  return Math.round((toDay - fromDay) / 86_400_000);
}
