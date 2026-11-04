import type { Kysely } from "kysely";
import type { Database, DatabaseExecutor } from "../../db/types/db.types.ts";
import { runInImmediateTransaction } from "../../db/runInImmediateTransaction.ts";
import { createId } from "../../db/createId.ts";
import { readInstanceSettings } from "../../settings/readInstanceSettings.ts";
import { getLocalDayFromInstant } from "../../time/localDayHelpers.ts";
import { enqueueEmail } from "../enqueueEmail/enqueueEmail.ts";
import { getDigestWindowFromInstant } from "./getDigestWindowFromInstant.ts";
import {
  readEligibleDigestEvents,
  type EligibleDigestEvent,
} from "./readEligibleDigestEvents.ts";
import { makeDigestPayloadFromEvents } from "./makeDigestPayloadFromEvents.ts";

type DigestWindow = NonNullable<ReturnType<typeof getDigestWindowFromInstant>>;
type PreparationOptions = Readonly<{
  database: Kysely<Database>;
  memberId: string;
  now: string;
}>;
/** The result of a member's atomic scheduling opportunity. */
export type DigestPreparationResult =
  | "prepared"
  | "empty"
  | "already_prepared"
  | "not_due";

async function _readOverdueIds(
  executor: DatabaseExecutor,
  memberId: string,
  window: DigestWindow,
  now: string,
): Promise<string[]> {
  const eventIds: string[] = [];
  let cursor = "";
  while (true) {
    const page = await executor
      .selectFrom("notification_digest_events")
      .select(["id", "occurred_at"])
      .where("member_id", "=", memberId)
      .where("state", "=", "pending")
      .where("occurred_at", "<", now)
      .where("id", ">", cursor)
      .orderBy("id")
      .limit(500)
      .execute();
    for (const event of page) {
      if (
        getLocalDayFromInstant({
          instant: event.occurred_at,
          timezone: window.timezone,
        }) < window.sendDate
      ) {
        eventIds.push(event.id);
      }
    }
    if (page.length < 500) {
      return eventIds;
    }
    cursor = page.at(-1)!.id;
  }
}

async function _reserveBatch(
  executor: DatabaseExecutor,
  memberId: string,
  now: string,
  window: DigestWindow,
): Promise<string> {
  const batchId = createId();
  await executor
    .insertInto("notification_digest_batches")
    .values({
      id: batchId,
      member_id: memberId,
      send_date: window.sendDate,
      timezone: window.timezone,
      cutoff_local_date: window.cutoffLocalDate,
      prepared_at: now,
      outbound_email_id: null,
      eligibility_snapshot_json: null,
      delivery_snapshot_json: null,
      provider_attempted_at: null,
    })
    .execute();
  return batchId;
}

async function _enqueueBatch(
  options: Readonly<{
    executor: DatabaseExecutor;
    memberId: string;
    now: string;
    window: DigestWindow;
    events: readonly EligibleDigestEvent[];
    baseUrl: string | null;
  }>,
): Promise<void> {
  const { executor, memberId, now, window, events } = options;
  const member = await executor
    .selectFrom("members")
    .select(["email", "display_name"])
    .where("id", "=", memberId)
    .executeTakeFirstOrThrow();
  const batchId = await _reserveBatch(executor, memberId, now, window);
  const payload = makeDigestPayloadFromEvents({
    events,
    window,
    baseUrl: options.baseUrl ?? "https://digest.invalid",
  });
  const queued = await enqueueEmail({
    executor,
    now,
    input: {
      kind: "daily_digest",
      toAddress: member.email,
      toMemberId: memberId,
      toDisplayName: member.display_name ?? undefined,
      triggerKind: "daily_digest",
      triggerId: batchId,
      idempotencyKey: `daily-digest:${memberId}:${window.sendDate}`,
      payload,
    },
  });
  await executor
    .updateTable("notification_digest_batches")
    .set({ outbound_email_id: queued.emailId })
    .where("id", "=", batchId)
    .execute();
  for (const entry of events)
    await executor
      .updateTable("notification_digest_events")
      .set({ state: "included", batch_id: batchId })
      .where("id", "=", entry.event.id)
      .execute();
}

async function _readAndCancelInvalid(
  executor: DatabaseExecutor,
  options: PreparationOptions,
  window: DigestWindow,
): Promise<EligibleDigestEvent[]> {
  const eventIds = await _readOverdueIds(
    executor,
    options.memberId,
    window,
    options.now,
  );
  const { eligible, cancelledIds } = await readEligibleDigestEvents({
    executor,
    memberId: options.memberId,
    eventIds,
    mode: "preparation",
  });
  for (const id of cancelledIds)
    await executor
      .updateTable("notification_digest_events")
      .set({ state: "cancelled" })
      .where("id", "=", id)
      .execute();
  return eligible;
}

async function _prepare(
  executor: DatabaseExecutor,
  options: PreparationOptions,
): Promise<DigestPreparationResult> {
  const settings = await readInstanceSettings({
    database: executor,
    keys: ["shoebox.timezone", "public.base_url"],
  });
  const window = getDigestWindowFromInstant({
    now: options.now,
    timezone: settings["shoebox.timezone"],
  });
  if (!window) {
    return "not_due";
  }
  const existing = await executor
    .selectFrom("notification_digest_batches")
    .select("id")
    .where("member_id", "=", options.memberId)
    .where("send_date", "=", window.sendDate)
    .executeTakeFirst();
  if (existing) {
    return "already_prepared";
  }
  const eligible = await _readAndCancelInvalid(executor, options, window);
  if (eligible.length === 0) {
    return "empty";
  }
  await _enqueueBatch({
    executor,
    memberId: options.memberId,
    now: options.now,
    window,
    events: eligible,
    baseUrl: settings["public.base_url"],
  });
  return "prepared";
}

/** Prepares one member's overdue activity atomically without provider I/O. */
export async function prepareDailyDigest(
  options: PreparationOptions,
): Promise<DigestPreparationResult> {
  return runInImmediateTransaction({
    database: options.database,
    callback: async (executor) => {
      return _prepare(executor, options);
    },
  });
}
