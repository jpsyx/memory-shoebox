/**
 * The one memoisation mechanism behind every `Intl.DateTimeFormat` this
 * product builds: a formatter is expensive to construct and there are at
 * most a handful of IANA zones in play, so each zone's formatter is built
 * once and kept.
 *
 * The locale and the options are the caller's own decision (`en-GB` prose
 * for alt text, `en-CA` `YYYY-MM-DD` for a calendar day), so this holds only
 * the cache: it takes the caller's factory and hands back a lookup that
 * builds a zone's formatter the first time that zone is asked for, and
 * reuses it after.
 *
 * @param makeFormatter Builds one zone's formatter. Called at most once per
 *   distinct zone.
 */
export function makeFormatterCacheByZone(
  makeFormatter: (timezone: string) => Intl.DateTimeFormat,
): (timezone: string) => Intl.DateTimeFormat {
  const formatters = new Map<string, Intl.DateTimeFormat>();

  return (timezone) => {
    const existing = formatters.get(timezone);
    if (existing !== undefined) {
      return existing;
    }
    const formatter = makeFormatter(timezone);
    formatters.set(timezone, formatter);
    return formatter;
  };
}
