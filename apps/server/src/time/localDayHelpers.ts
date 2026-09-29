import { makeFormatterCacheByZone } from "./makeFormatterCacheByZone.ts";

/**
 * `en-CA` formats a date as `YYYY-MM-DD`, which is the form the schema and
 * the contract both use for a calendar date. The formatter is cached by
 * zone: see {@link makeFormatterCacheByZone} for why.
 */
const _formatterFor = makeFormatterCacheByZone((timezone) => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
});

/**
 * The calendar day an instant fell on, in one IANA zone, as `YYYY-MM-DD`.
 *
 * SQLite has no zone database, so every day boundary in the product resolves
 * here instead: the day a photograph lands on, the activity log's day, and the
 * removal reminder's week (`data-models.md` § `settings`, Decision 10).
 *
 * @param options.instant An ISO-8601 instant.
 * @param options.timezone An IANA zone, from `shoebox.timezone`.
 */
export function getLocalDayFromInstant(options: {
  instant: string;
  timezone: string;
}): string {
  return _formatterFor(options.timezone).format(new Date(options.instant));
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
  const fromDay = getLocalDayFromInstant({
    instant: options.from,
    timezone: options.timezone,
  });
  const toDay = getLocalDayFromInstant({
    instant: options.to,
    timezone: options.timezone,
  });
  const fromMidnight = Date.parse(`${fromDay}T00:00:00Z`);
  const toMidnight = Date.parse(`${toDay}T00:00:00Z`);
  return Math.round((toMidnight - fromMidnight) / 86_400_000);
}
