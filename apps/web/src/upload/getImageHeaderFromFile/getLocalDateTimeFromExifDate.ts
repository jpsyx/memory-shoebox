/**
 * A capture date as "2026-09-14T06:41:32", or undefined.
 *
 * Reads EXIF's own "2026:09:14 06:41:32", and the two forms other writers use
 * for the same wall clock: "2026-09-14 06:41:32" and "2026-09-14T06:41:32".
 * Fractional seconds are dropped. That is every shape the server's rung 1
 * reads, so none is discarded here. The all-zero date some cameras write for
 * "not set" is not a date, and neither is anything else that does not have one
 * of these shapes.
 */
export function getLocalDateTimeFromExifDate(
  exifDate: string,
): string | undefined {
  const isoForm = exifDate
    .trim()
    .replace(/^(\d{4}):(\d{2}):(\d{2}) /, "$1-$2-$3T")
    .replace(/^(\d{4}-\d{2}-\d{2}) /, "$1T");
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/.exec(isoForm);
  if (match === null) {
    return undefined;
  }
  const [, year, month, day, hour, minute, second] = match;
  const isPlausible =
    year !== "0000" &&
    Number(month) >= 1 &&
    Number(month) <= 12 &&
    Number(day) >= 1 &&
    Number(day) <= 31 &&
    Number(hour) <= 23 &&
    Number(minute) <= 59 &&
    Number(second) <= 59;
  return isPlausible
    ? `${year}-${month}-${day}T${hour}:${minute}:${second}`
    : undefined;
}
