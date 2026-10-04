/** A calendar day formatted in UTC, without shifting its local date. */
export function dayLabel(
  options: Readonly<{ day: string; format: Intl.DateTimeFormatOptions }>,
): string {
  return new Intl.DateTimeFormat("en-GB", {
    ...options.format,
    timeZone: "UTC",
  }).format(new Date(`${options.day}T00:00:00.000Z`));
}
