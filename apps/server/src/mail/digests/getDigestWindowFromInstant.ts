import { getLocalDayFromInstant } from "../../time/localDayHelpers.ts";
import { getLocalWallClockFromInstant } from "../../time/wallClockHelpers.ts";

/** The current local day's digest opportunity, after nine in the morning. */
export function getDigestWindowFromInstant(
  options: Readonly<{ now: string; timezone: string }>,
): { sendDate: string; timezone: string; cutoffLocalDate: string } | null {
  if (
    getLocalWallClockFromInstant({
      instant: options.now,
      offsetMinutes: null,
      timezone: options.timezone,
    }) < "09:00:00"
  ) {
    return null;
  }
  const sendDate = getLocalDayFromInstant({
    instant: options.now,
    timezone: options.timezone,
  });
  return { sendDate, timezone: options.timezone, cutoffLocalDate: sendDate };
}
