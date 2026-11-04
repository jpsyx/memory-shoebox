import { z } from "zod";
import type { Selectable } from "kysely";
import {
  dailyDigestEmailPayloadSchema,
  type DailyDigestEmailPayload,
} from "@memory-shoebox/shared";
import { dailyDigestEmail } from "@memory-shoebox/emails";
import { runInImmediateTransaction } from "../../db/runInImmediateTransaction.ts";
import type { Database, DatabaseExecutor } from "../../db/types/db.types.ts";
import type { WorkerContext, OutboundEmailRow } from "../mailQueue.types.ts";
import type { EmailSendRequest } from "../EmailService/EmailService.types.ts";
import {
  readEligibleDigestEvents,
  type EligibleDigestEvent,
} from "./readEligibleDigestEvents.ts";
import { makeDigestPayloadFromEvents } from "./makeDigestPayloadFromEvents.ts";

/** A durable decision made before handing a digest to the provider. */
export type DigestDeliveryPreparation =
  | { state: "ready"; request: EmailSendRequest }
  | { state: "cancelled" }
  | { state: "deferred" };
type DeliveryOptions = Readonly<{
  context: WorkerContext;
  row: OutboundEmailRow;
  from: string;
}>;
type Batch = Selectable<Database["notification_digest_batches"]>;
const requestSchema = z.object({
  from: z.string(),
  to: z.string(),
  subject: z.string(),
  html: z.string(),
  text: z.string(),
  idempotencyKey: z.string(),
});

function _manifest(events: readonly EligibleDigestEvent[]): string {
  return JSON.stringify(
    events
      .map((entry) => {
        return { id: entry.event.id, itemIds: entry.itemIds };
      })
      .sort((a, b) => {
        return a.id.localeCompare(b.id);
      }),
  );
}

async function _cancel(
  options: DeliveryOptions,
  executor: DatabaseExecutor = options.context.database,
): Promise<DigestDeliveryPreparation> {
  await executor
    .updateTable("outbound_emails")
    .set({ state: "cancelled" })
    .where("id", "=", options.row.id)
    .where("state", "=", "sending")
    .execute();
  return { state: "cancelled" };
}

async function _prepareFrozenRetry(
  options: DeliveryOptions,
  batch: Batch,
  eventIds: readonly string[],
): Promise<DigestDeliveryPreparation> {
  return runInImmediateTransaction({
    database: options.context.database,
    callback: async (executor) => {
      const current = await readEligibleDigestEvents({
        executor,
        memberId: batch.member_id,
        eventIds,
        mode: "delivery",
      });
      if (
        current.eligible.length === 0 ||
        batch.eligibility_snapshot_json !== _manifest(current.eligible) ||
        batch.delivery_snapshot_json === null
      ) {
        return _cancel(options, executor);
      }
      return {
        state: "ready",
        request: requestSchema.parse(JSON.parse(batch.delivery_snapshot_json)),
      };
    },
  });
}

async function _freeze(
  executor: DatabaseExecutor,
  options: DeliveryOptions,
  batch: Batch,
  eventIds: readonly string[],
  manifest: string,
  request: EmailSendRequest,
  payload: DailyDigestEmailPayload,
): Promise<DigestDeliveryPreparation> {
  const checked = await readEligibleDigestEvents({
    executor,
    memberId: batch.member_id,
    eventIds,
    mode: "delivery",
  });
  if (_manifest(checked.eligible) !== manifest) {
    await executor
      .updateTable("outbound_emails")
      .set({
        state: "queued",
        next_attempt_at: new Date(
          Date.parse(options.context.now) + 10_000,
        ).toISOString(),
      })
      .where("id", "=", options.row.id)
      .where("state", "=", "sending")
      .execute();
    return { state: "deferred" };
  }
  await executor
    .updateTable("notification_digest_batches")
    .set({
      delivery_snapshot_json: JSON.stringify(request),
      eligibility_snapshot_json: manifest,
      provider_attempted_at: options.context.now,
    })
    .where("id", "=", batch.id)
    .execute();
  await executor
    .updateTable("outbound_emails")
    .set({ subject: request.subject, payload_json: JSON.stringify(payload) })
    .where("id", "=", options.row.id)
    .execute();
  return { state: "ready", request };
}

async function _renderAndFreeze(
  options: DeliveryOptions,
  batch: Batch,
  eventIds: readonly string[],
  events: readonly EligibleDigestEvent[],
): Promise<DigestDeliveryPreparation> {
  const previous = dailyDigestEmailPayloadSchema.parse(
    JSON.parse(options.row.payload_json),
  );
  const payload = dailyDigestEmailPayloadSchema.parse({
    ...previous,
    ...makeDigestPayloadFromEvents({
      events,
      window: { sendDate: batch.send_date, timezone: batch.timezone },
      baseUrl: previous.baseUrl,
    }),
  });
  const rendered = await dailyDigestEmail.render(payload);
  const request = {
    from: options.from,
    to: options.row.to_address,
    subject: dailyDigestEmail.subject(payload),
    ...rendered,
    idempotencyKey: options.row.idempotency_key,
  };
  return runInImmediateTransaction({
    database: options.context.database,
    callback: async (executor) => {
      return _freeze(
        executor,
        options,
        batch,
        eventIds,
        _manifest(events),
        request,
        payload,
      );
    },
  });
}

/** Rechecks every contributing source and freezes the exact request before handoff. */
export async function prepareDigestDelivery(
  options: DeliveryOptions,
): Promise<DigestDeliveryPreparation> {
  const { context, row } = options;
  const batch = await context.database
    .selectFrom("notification_digest_batches")
    .selectAll()
    .where("id", "=", row.trigger_id)
    .executeTakeFirst();
  if (!batch || row.to_member_id !== batch.member_id) {
    return _cancel(options);
  }
  const events = await context.database
    .selectFrom("notification_digest_events")
    .select("id")
    .where("batch_id", "=", batch.id)
    .execute();
  const eventIds = events.map((event) => {
    return event.id;
  });
  const current = await readEligibleDigestEvents({
    executor: context.database,
    memberId: batch.member_id,
    eventIds,
    mode: "delivery",
  });
  if (current.eligible.length === 0) {
    return _cancel(options);
  }
  if (batch.provider_attempted_at !== null) {
    return _prepareFrozenRetry(options, batch, eventIds);
  }
  return _renderAndFreeze(options, batch, eventIds, current.eligible);
}
