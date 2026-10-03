import type { UploadSessionEmailPayload } from "@memory-shoebox/shared";
import { spellSmallNumber } from "../../lib/spellSmallNumber.ts";
/** A calendar day formatted in UTC, without shifting its local date. */
export function dayLabel(
  options: Readonly<{ day: string; format: Intl.DateTimeFormatOptions }>,
): string {
  return new Intl.DateTimeFormat("en-GB", {
    ...options.format,
    timeZone: "UTC",
  }).format(new Date(`${options.day}T00:00:00.000Z`));
}
/** A day such as "14 September". */
export function shortDayLabel(day: string): string {
  return dayLabel({ day, format: { day: "numeric", month: "long" } });
}
/** A day such as "14 September 2026". */
export function longDayLabel(day: string): string {
  return dayLabel({
    day,
    format: { day: "numeric", month: "long", year: "numeric" },
  });
}
/** A day prefixed with its weekday. */
export function weekdayDayLabel(day: string): string {
  return `${dayLabel({ day, format: { weekday: "long" } })} ${longDayLabel(day)}`;
}
/** The capitalized number of days in the opening sentence. */
export function capitalizedDayCountLabel(dayCount: number): string {
  const word = spellSmallNumber(dayCount);
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
}
/** The first day, including its year when the range crosses years. */
export function firstDayLabel(
  payload: Readonly<UploadSessionEmailPayload>,
): string {
  return payload.firstCapturedOn.slice(0, 4) ===
    payload.lastCapturedOn.slice(0, 4)
    ? shortDayLabel(payload.firstCapturedOn)
    : longDayLabel(payload.firstCapturedOn);
}
/** Who put up how many of this reader's photos, and from when. */
export function uploadSessionSubject(
  payload: Readonly<UploadSessionEmailPayload>,
): string {
  const photoCountLabel =
    payload.visibleItemCount === 1
      ? "1 photo"
      : `${payload.visibleItemCount} photos`;
  return payload.visibleDayCount > 1
    ? `${payload.uploaderDisplayName} put up ${photoCountLabel}, from ${payload.visibleDayCount} days`
    : `${payload.uploaderDisplayName} put up ${photoCountLabel} from ${shortDayLabel(payload.capturedOn)}`;
}
