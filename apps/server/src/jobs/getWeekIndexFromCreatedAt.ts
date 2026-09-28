import { countLocalDaysBetween } from "../time/localDayHelpers.ts";

/**
 * `week_index = floor((now - request.created_at) / 7 days)`.
 *
 * The neat part, and the whole reason the job holds no scheduler state: run it
 * hourly with a blind `INSERT ... ON CONFLICT DO NOTHING` and it is
 * arithmetically impossible to send two reminders in one week
 * (`data-models.md` § `outbound_emails`). No "last reminded at" column to
 * drift.
 *
 * **Calendar days in `shoebox.timezone`, not elapsed hours.** The week
 * boundary lands at local midnight, which is the third place that setting
 * fixes a clock that otherwise has none
 * (`apis/notifications.md` § 6 `removal_reminder`).
 */
export function getWeekIndexFromCreatedAt(options: {
  createdAt: string;
  now: string;
  timezone: string;
}): number {
  const days = countLocalDaysBetween({
    from: options.createdAt,
    to: options.now,
    timezone: options.timezone,
  });
  return Math.floor(days / 7);
}
