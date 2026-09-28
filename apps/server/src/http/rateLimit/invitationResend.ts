import type { Kysely } from "kysely";
import type { Database } from "../../db/types.ts";
import type { RateLimitOutcome } from "./buckets.ts";

/** One per minute. */
const MINUTE_WINDOW_SECONDS = 60;
/** Ten per day. */
const DAY_WINDOW_SECONDS = 86_400;
const DAY_LIMIT = 10;

/**
 * Applies `POST /api/members/:memberId/invitation/resend`'s limit.
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
