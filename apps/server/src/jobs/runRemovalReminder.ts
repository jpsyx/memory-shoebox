import type { Kysely } from "kysely";
import type { Database, DatabaseExecutor } from "../db/types/db.types.ts";
import { runInImmediateTransaction } from "../db/runInImmediateTransaction.ts";
import { enqueueRemovalEmails } from "../removals/enqueueRemovalEmails.ts";
import type { RemovalRequestRow } from "../removals/makeRemovalRequestDtosFromRows.ts";
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

type ReminderCandidate = {
  requestId: string;
  requestCreatedAt: string;
  uploaderMemberId: string;
  memberId: string;
};

async function _readReminderCandidates(
  transaction: DatabaseExecutor,
): Promise<ReminderCandidate[]> {
  // One query, not one per request: the recipient set is the snapshot uploader
  // OR any active admin, and an admin who is also the uploader matches the one
  // member row once, so there is nothing to de-duplicate afterwards.
  return transaction
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
}

async function _getDueReminders(
  options: Readonly<{
    transaction: DatabaseExecutor;
    now: string;
    timezone: string;
  }>,
): Promise<DueRemovalReminder[]> {
  const candidates = await _readReminderCandidates(options.transaction);
  return candidates.flatMap((candidate): DueRemovalReminder[] => {
    const weekIndex = getWeekIndexFromCreatedAt({
      createdAt: candidate.requestCreatedAt,
      now: options.now,
      timezone: options.timezone,
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
}

async function _enqueueDueRequests(
  options: Readonly<{
    transaction: DatabaseExecutor;
    due: readonly DueRemovalReminder[];
    now: string;
  }>,
): Promise<void> {
  if (options.due.length === 0) {
    return;
  }
  const weekIndexes = new Map(
    options.due.map((reminder) => {
      return [reminder.requestId, reminder.weekIndex];
    }),
  );
  const requests = await options.transaction
    .selectFrom("removal_requests")
    .selectAll()
    .where("id", "in", [...weekIndexes.keys()])
    .where("state", "=", "open")
    .execute();
  // Each requester acts as their own exclusion identity, including admins.
  const batches = Map.groupBy(requests, (request: RemovalRequestRow) => {
    return request.requested_by_member_id;
  });
  await [...batches].reduce(async (previousEnqueue, [requesterId, batch]) => {
    await previousEnqueue;
    await enqueueRemovalEmails({
      transaction: options.transaction,
      requests: batch,
      event: "reminder",
      weekIndexes,
      actorMemberId: requesterId,
      now: options.now,
    });
  }, Promise.resolve());
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
 * Selection and blind conflict-noop enqueues share one immediate transaction.
 * No last-reminded state or outbound preflight lookup is needed.
 */
export async function runRemovalReminder(
  options: Readonly<{
    database: Kysely<Database>;
    now: string;
  }>,
): Promise<RemovalReminderSummary> {
  return runInImmediateTransaction({
    database: options.database,
    callback: async (transaction) => {
      const settings = await readInstanceSettings({
        database: transaction,
        keys: ["shoebox.timezone"],
      });
      const due = await _getDueReminders({
        transaction,
        now: options.now,
        timezone: settings["shoebox.timezone"],
      });
      await _enqueueDueRequests({ transaction, due, now: options.now });
      return { due };
    },
  });
}
