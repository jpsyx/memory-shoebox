/** A fixed instant, so that every fixture reads as one moment in time. */
export const NOW = "2026-09-27T10:00:00.000Z";

/** Shifts an ISO instant by whole minutes. Negative goes into the past. */
export function shiftMinutes(options: {
  instant: string;
  minutes: number;
}): string {
  return new Date(
    Date.parse(options.instant) + options.minutes * 60_000,
  ).toISOString();
}

/** Shifts an ISO instant by whole days. Negative goes into the past. */
export function shiftDays(options: { instant: string; days: number }): string {
  return shiftMinutes({
    instant: options.instant,
    minutes: options.days * 24 * 60,
  });
}
