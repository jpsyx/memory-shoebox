/**
 * The idempotency recipe:
 * `removal-reminder:<request_id>:<member_id>:<week_index>`.
 *
 * Verbatim from `apis/notifications.md` § The nine messages. It is the only
 * thing standing between an hourly job and a reminder every hour.
 */
export function makeRemovalReminderKeyFromRequest(options: {
  requestId: string;
  memberId: string;
  weekIndex: number;
}): string {
  return `removal-reminder:${options.requestId}:${options.memberId}:${options.weekIndex}`;
}
