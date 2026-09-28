import type { Kysely } from "kysely";
import type { Database } from "../db/types/db.types.ts";
import { readInstanceSettings } from "../settings/readInstanceSettings.ts";
import { getWeekIndexFromCreatedAt } from "./getWeekIndexFromCreatedAt.ts";
import { makeRemovalReminderKeyFromRequest } from "./makeRemovalReminderKeyFromRequest.ts";

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
  due: DueRemovalReminder[];
};

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

  // `flatMap` rather than `filter` then `map`, so `weekIndex` is computed once
  // and serves both the week-zero guard and the reminder it goes into.
  const due = candidates.flatMap((candidate): DueRemovalReminder[] => {
    const weekIndex = getWeekIndexFromCreatedAt({
      createdAt: candidate.requestCreatedAt,
      now: options.now,
      timezone: settings["shoebox.timezone"],
    });
    if (weekIndex < 1) {
      return [];
    }
    return [
      {
        requestId: candidate.requestId,
        memberId: candidate.memberId,
        relation:
          candidate.memberId === candidate.uploaderMemberId
            ? "uploader"
            : "admin",
        weekIndex,
        idempotencyKey: makeRemovalReminderKeyFromRequest({
          requestId: candidate.requestId,
          memberId: candidate.memberId,
          weekIndex,
        }),
      },
    ];
  });

  return { due };
}
