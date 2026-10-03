/**
 * EXIF's "+02:00" as 120 and "-05:30" as -330, or undefined if it is not
 * one.
 */
export function getOffsetMinutesFromExifOffset(
  exifOffset: string,
): number | undefined {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(exifOffset.trim());
  if (match === null) {
    return undefined;
  }
  const [, sign, hours, minutes] = match;
  const total = Number(hours) * 60 + Number(minutes);
  if (Number(minutes) > 59 || total > 14 * 60) {
    return undefined;
  }
  return sign === "-" ? -total : total;
}
