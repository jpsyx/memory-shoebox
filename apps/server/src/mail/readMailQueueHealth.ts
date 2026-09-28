import type { Kysely } from "kysely";
import type { MailQueueHealth } from "@memory-shoebox/shared";
import type { Database } from "../db/types/db.types.ts";

/** Twenty-four hours, the window `sentLast24hCount` counts over. */
const ONE_DAY_MS = 86_400_000;

/**
 * What is sitting in `outbound_emails` right now.
 *
 * **There is no mail-status table** (`data-models.md` § `outbound_emails`):
 * everything the admin banner prints is a query over this one, which is why
 * migration 0007 carries `(state, created_at)`.
 *
 * `GET /api/mail/health`'s **diagnosis ladder** is not here. Two of its five
 * rungs need domain verification, which belongs to the route rather than to
 * this query. This is the part that falls out of the worker's own indexes.
 *
 * **`lastFailedAt` is the failing row's `created_at`, not the moment it
 * failed**, because no column records the latter: `sent_at` exists and a
 * `failed_at` does not. On a queue that drains in minutes the two are close,
 * and whether the banner needs better than that is `GET /api/mail/health`'s
 * call rather than this query's, to be settled before a column is added for
 * it.
 *
 * **`sending` is counted nowhere.** The three state counts are `queued`,
 * `failed` and `suppressed`, and `sentLast24hCount` reads `sent`: a row left
 * in `sending` by a process that died between the claim and the finalise
 * shows up in none of them. `runMailQueueOnce.ts` explains why nothing
 * recovers such a row, and that is a decision about the queue. This is its
 * consequence on the admin's surface, and it is that the row is invisible here
 * too, so nobody would ever find out it was stranded. `MailQueueHealth`'s
 * shape is frozen in
 * `apis/notifications.md` § Mail, so widening it is not this function's call:
 * `GET /api/mail/health` owns the shape it answers with and its diagnosis
 * ladder, and whether the banner needs to see a row mid-flight is decided
 * there.
 *
 * Nothing here reads `subject` or `payload_json`. A queued `sign_in_code` row
 * holds a live code, and this answer reaches an admin's screen.
 *
 * No formatted or relative string comes out of here. The surface's "has not
 * gone out for three hours" is computed in the browser from `oldestQueuedAt`.
 *
 * @param options.database The catalog.
 * @param options.now The instant the window is measured back from.
 * @returns The counts and instants the admin banner prints.
 */
export async function readMailQueueHealth(options: {
  database: Kysely<Database>;
  now: string;
}): Promise<MailQueueHealth> {
  const byState = await options.database
    .selectFrom("outbound_emails")
    .select(({ fn }) => {
      return [
        "state",
        fn.countAll<number>().as("count"),
        fn.min<string | null>("created_at").as("oldestCreatedAt"),
        fn.max<string | null>("created_at").as("newestCreatedAt"),
        fn.max<string | null>("sent_at").as("lastSentAt"),
      ];
    })
    .groupBy("state")
    .execute();

  const forState = (state: string) => {
    return byState.find((row) => {
      return row.state === state;
    });
  };

  // Exclusive at the boundary: a row sent exactly twenty-four hours ago to the
  // millisecond falls outside the window. Nothing turns on that edge, since
  // the count feeds a banner rather than a decision.
  const dayAgo = new Date(Date.parse(options.now) - ONE_DAY_MS).toISOString();
  const sentRecently = await options.database
    .selectFrom("outbound_emails")
    .select(({ fn }) => {
      return fn.countAll<number>().as("count");
    })
    .where("state", "=", "sent")
    .where("sent_at", ">", dayAgo)
    .executeTakeFirstOrThrow();

  return {
    queuedCount: Number(forState("queued")?.count ?? 0),
    failedCount: Number(forState("failed")?.count ?? 0),
    suppressedCount: Number(forState("suppressed")?.count ?? 0),
    sentLast24hCount: Number(sentRecently.count),
    oldestQueuedAt: forState("queued")?.oldestCreatedAt ?? null,
    lastSentAt: forState("sent")?.lastSentAt ?? null,
    lastFailedAt: forState("failed")?.newestCreatedAt ?? null,
  };
}
