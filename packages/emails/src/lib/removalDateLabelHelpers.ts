import { dayLabel } from "./dayLabel.ts";
/** A calendar day already belongs to the Shoebox and must never shift zones. */
export function calendarDayLabel(
  options: Readonly<{ day: string; includeYear?: boolean }>,
): string {
  return dayLabel({
    day: options.day,
    format: {
      day: "numeric",
      month: "long",
      ...(options.includeYear === false ? {} : { year: "numeric" }),
    },
  });
}

/** A resolution instant is displayed in the snapshotted Shoebox timezone. */
export function resolutionDateLabel(
  options: Readonly<{
    instant: string;
    timezone: string;
    includeYear?: boolean;
  }>,
): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: options.timezone,
    day: "numeric",
    month: "long",
    ...(options.includeYear === false ? {} : { year: "numeric" }),
  }).format(new Date(options.instant));
}
