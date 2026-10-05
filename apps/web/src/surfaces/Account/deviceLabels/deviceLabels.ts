/**
 * The two strings a device row needs, computed from timestamps rather than
 * carried in the payload.
 *
 * `conventions.md` § Field naming forbids a formatted or a relative date in
 * any payload: the server sends the timestamp and the browser says when.
 * `SessionDto` carries `lastUsedAt` and `expiresAt` as timestamps for exactly
 * that reason, and this module is where they turn into words. Both functions
 * take `now` explicitly so a test never depends on the wall clock.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The drawn `device.daysIdle >= 26`, restated in remaining-days terms:
 * 30 - 26 = 4 days or fewer left is when the copy starts warning.
 */
const FALLOUT_WARNING_DAYS_LEFT = 4;

/**
 * "Today", "Yesterday", or "N days ago", from `lastUsedAt`.
 *
 * Whole days are counted with `Math.floor` on the millisecond difference, so
 * anything still within the same 24 hours reads "Today" rather than turning
 * over at midnight.
 *
 * @param options.lastUsedAt The session's `lastUsedAt` timestamp.
 * @param options.now The moment to measure from.
 */
export function lastUsedLabel(options: {
  lastUsedAt: string;
  now: Date;
}): string {
  const { lastUsedAt, now } = options;
  const daysUsed = Math.floor(
    (now.getTime() - new Date(lastUsedAt).getTime()) / MS_PER_DAY,
  );
  if (daysUsed <= 0) {
    return "Today";
  }
  if (daysUsed === 1) {
    return "Yesterday";
  }
  return `${daysUsed} days ago`;
}

/**
 * "N days left", "Falls out in N days", or "Falls out today", from
 * `expiresAt`.
 *
 * Whole days are counted with `Math.ceil` on the millisecond difference, so
 * a device with 29.2 days left still reads "30 days left" and one with 0.2
 * days left falls out today rather than "in 1 days". The two-phrase split
 * happens at `FALLOUT_WARNING_DAYS_LEFT`.
 *
 * An `expiresAt` already in the past is clamped to "Falls out today" rather
 * than validated: `daysLeft` comes out zero or negative and both fall into
 * the same `<= 1` branch as a device expiring later today. The caller is not
 * meant to hand this function an already-expired session (Task 10's session
 * list excludes those), so this is a safe fallback rather than a case this
 * module is responsible for reporting.
 *
 * @param options.expiresAt The session's `expiresAt` timestamp.
 * @param options.now The moment to measure from.
 */
export function daysLeftLabel(options: {
  expiresAt: string;
  now: Date;
}): string {
  const { expiresAt, now } = options;
  const daysLeft = Math.ceil(
    (new Date(expiresAt).getTime() - now.getTime()) / MS_PER_DAY,
  );
  if (daysLeft <= 1) {
    return "Falls out today";
  }
  if (daysLeft <= FALLOUT_WARNING_DAYS_LEFT) {
    return `Falls out in ${daysLeft} days`;
  }
  return `${daysLeft} days left`;
}
