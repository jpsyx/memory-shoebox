import type { Kysely } from "kysely";
import type { Database } from "../db/types.ts";
import { readInstanceSettings } from "../settings/instanceSettings.ts";
import { countLocalDaysBetween } from "../time/localDay.ts";

/** One reminder that is owed to one person about one request. */
export type DueRemovalReminder = {
  requestId: string;
  memberId: string;
  /** Chooses "you put it up" against "an admin is copied on this". */
  relation: "uploader" | "admin";
  /** 1 for the first reminder. Lets the copy escalate if it ever should. */
  weekIndex: number;
  idempotencyKey: string;
};

/** What one run found. */
export type RemovalReminderSummary = {
  due: readonly DueRemovalReminder[];
};

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
export function computeWeekIndex(options: {
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

/**
 * The idempotency recipe:
 * `removal-reminder:<request_id>:<member_id>:<week_index>`.
 *
 * Verbatim from `apis/notifications.md` § The nine messages. It is the only
 * thing standing between an hourly job and a reminder every hour.
 */
export function buildRemovalReminderKey(options: {
  requestId: string;
  memberId: string;
  weekIndex: number;
}): string {
  return `removal-reminder:${options.requestId}:${options.memberId}:${options.weekIndex}`;
}

/**
 * Finds every weekly reminder that is owed right now.
 *
 * **Recipients are re-evaluated at every firing, not snapshotted from the
 * original request** (`apis/notifications.md` § 6), because the admin set may
 * have changed during the week. The uploader comes from
 * `removal_requests.item_uploader_member_id`, the snapshot column, and never
 * from a join to `items`: `item_id` is `SET NULL`, so the join drops the row
 * in exactly the case that matters.
 *
 * **`week_index >= 1` is required, not optional.** Week zero is the week of
 * the request itself, during which `removal_request` already went out, and
 * without the guard the first "still waiting" reminder lands within the hour
 * of somebody asking, chasing an uploader who has not yet had a chance to read
 * the original.
 *
 * **This does not enqueue anything yet.** The message's copy, its subject and
 * its payload type belong to step 7a with the other two removal messages, and
 * a payload invented here would be a guess. Step 7a passes each row of `due`
 * to `enqueueEmail` with the key this already built.
 */
export async function runRemovalReminder(options: {
  database: Kysely<Database>;
  now: string;
}): Promise<RemovalReminderSummary> {
  const settings = await readInstanceSettings(options.database, [
    "shoebox.timezone",
  ]);

  // One query, not one per request: the recipient set is the snapshot uploader
  // OR any active admin, and an admin who is also the uploader matches the one
  // member row once, so there is nothing to de-duplicate afterwards.
  const candidates = await options.database
    .selectFrom("removal_requests as request")
    .innerJoin("members as member", (join) => {
      return join.on((eb) => {
        return eb.or([
          eb("member.id", "=", eb.ref("request.item_uploader_member_id")),
          eb("member.role", "=", "admin"),
        ]);
      });
    })
    .select([
      "request.id as requestId",
      "request.created_at as requestCreatedAt",
      "request.item_uploader_member_id as uploaderMemberId",
      "member.id as memberId",
    ])
    .where("request.state", "=", "open")
    .where("member.status", "=", "active")
    .where("member.notify_on_removal", "=", 1)
    .whereRef("member.id", "<>", "request.requested_by_member_id")
    .execute();

  const due: DueRemovalReminder[] = [];
  for (const candidate of candidates) {
    const weekIndex = computeWeekIndex({
      createdAt: candidate.requestCreatedAt,
      now: options.now,
      timezone: settings["shoebox.timezone"],
    });
    if (weekIndex < 1) {
      continue;
    }
    due.push({
      requestId: candidate.requestId,
      memberId: candidate.memberId,
      relation:
        candidate.memberId === candidate.uploaderMemberId
          ? "uploader"
          : "admin",
      weekIndex,
      idempotencyKey: buildRemovalReminderKey({
        requestId: candidate.requestId,
        memberId: candidate.memberId,
        weekIndex,
      }),
    });
  }

  return { due };
}
