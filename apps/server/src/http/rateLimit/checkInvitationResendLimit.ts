import type { Kysely } from "kysely";
import type { Database } from "../../db/types/db.types.ts";
import type {
  RateLimitOutcome,
  RateLimitWindow,
} from "./createFixedWindowLimiter.ts";
import { RATE_LIMIT_RULES } from "./rateLimit.constants.ts";

/**
 * The resend rule's two windows, shortest first.
 *
 * Sorted on their length rather than read by index, so that the order the
 * rows happen to be written in `rules.ts` is not load-bearing: the shorter
 * window is the minute half, read from `invitations.last_sent_at`, and the
 * longer is the daily half, counted over `outbound_emails` rows.
 *
 * Throws rather than guessing when the rule stops declaring exactly two. This
 * function can enforce whatever numbers the table gives it, but not a shape
 * it was not written for, and a silent misreading is the drift that deriving
 * the numbers exists to prevent.
 */
function _readResendWindows(): {
  minuteWindow: RateLimitWindow;
  dayWindow: RateLimitWindow;
} {
  const windows: RateLimitWindow[] = [
    ...RATE_LIMIT_RULES.invitationResendPerInvitation.windows,
  ].sort((left, right) => {
    return left.windowSeconds - right.windowSeconds;
  });
  const minuteWindow = windows[0];
  const dayWindow = windows[1];
  if (
    windows.length !== 2 ||
    minuteWindow === undefined ||
    dayWindow === undefined
  ) {
    throw new Error(
      "invitationResendPerInvitation must declare exactly two windows: a shorter one this reads from last_sent_at, and a longer one it counts.",
    );
  }
  if (minuteWindow.limit !== 1) {
    throw new Error(
      "invitationResendPerInvitation's shorter window must allow one send: last_sent_at records a single instant and cannot count past one.",
    );
  }
  return { minuteWindow, dayWindow };
}

const RESEND_WINDOWS = _readResendWindows();
/** The shorter window's length, as the rule table declares it. */
const MINUTE_WINDOW_SECONDS = RESEND_WINDOWS.minuteWindow.windowSeconds;
/** The longer window's length, as the rule table declares it. */
const DAY_WINDOW_SECONDS = RESEND_WINDOWS.dayWindow.windowSeconds;
/** The longer window's allowance, as the rule table declares it. */
const DAY_LIMIT = RESEND_WINDOWS.dayWindow.limit;

/**
 * Applies `POST /api/members/:memberId/invitation/resend`'s limit.
 *
 * **The numbers are the rule table's, not a copy of them.**
 * `RATE_LIMIT_RULES.invitationResendPerInvitation` is what a reader checks
 * against `conventions.md`, so a second set of constants here that drifted
 * from it would be invisible in exactly the place people look.
 *
 * **The one rule in the table that is not an in-memory counter.**
 * `conventions.md` § Rate limits says the middleware reads
 * `invitations.last_sent_at`, which exists for this, and it is the right call:
 * a restart forgetting that an invitation went out a moment ago would let an
 * admin send a second one, and the person receiving two identical invitations
 * has been told something about our uptime rather than about the Shoebox.
 *
 * The daily half counts `outbound_emails` rows rather than a column, because
 * `send_count` is a running total with no times on it, and the rows are the
 * only record of **when** each send happened.
 *
 * A member with no invitation is allowed through: the route's own 404 is the
 * right answer there, and a rate limiter that answered first would turn a
 * missing row into a 429.
 */
export async function checkInvitationResendLimit(options: {
  database: Kysely<Database>;
  memberId: string;
  now: string;
}): Promise<RateLimitOutcome> {
  const nowMs = Date.parse(options.now);

  const invitation = await options.database
    .selectFrom("invitations")
    .select(["id", "last_sent_at"])
    .where("member_id", "=", options.memberId)
    // uuidv7 sorts by creation, so the largest id is the latest invitation.
    .orderBy("id", "desc")
    .limit(1)
    .executeTakeFirst();

  if (invitation === undefined) {
    return { isAllowed: true, retryAfterSeconds: 0 };
  }

  const secondsSinceLastSend =
    (nowMs - Date.parse(invitation.last_sent_at)) / 1000;
  if (secondsSinceLastSend < MINUTE_WINDOW_SECONDS) {
    return {
      isAllowed: false,
      retryAfterSeconds: Math.ceil(
        MINUTE_WINDOW_SECONDS - secondsSinceLastSend,
      ),
    };
  }

  const dayStart = new Date(nowMs - DAY_WINDOW_SECONDS * 1000).toISOString();
  const sends = await options.database
    .selectFrom("outbound_emails")
    .select(["created_at"])
    .where("trigger_kind", "=", "invitation")
    .where("trigger_id", "=", invitation.id)
    .where("created_at", ">", dayStart)
    .orderBy("created_at", "asc")
    .execute();

  // The window frees up when the oldest send in it falls out of the day, so
  // the oldest row is read here rather than after the count: with the day's
  // allowance unspent there is no oldest row to read and nothing to refuse.
  const oldestSend = sends[0];
  if (oldestSend === undefined || sends.length < DAY_LIMIT) {
    return { isAllowed: true, retryAfterSeconds: 0 };
  }

  const oldestMs = Date.parse(oldestSend.created_at);
  return {
    isAllowed: false,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((oldestMs + DAY_WINDOW_SECONDS * 1000 - nowMs) / 1000),
    ),
  };
}
