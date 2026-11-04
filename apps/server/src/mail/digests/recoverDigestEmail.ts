import { dailyDigestEmailPayloadSchema } from "@memory-shoebox/shared";
import { dailyDigestEmail } from "@memory-shoebox/emails";
import type { DatabaseExecutor, Database } from "../../db/types/db.types.ts";
import type { OutboundEmailRow } from "../mailQueue.types.ts";
import type { Selectable } from "kysely";
import type { EligibleDigestEvent } from "./digest.types.ts";
import { readEligibleDigestEvents } from "./readEligibleDigestEvents.ts";
import { makeDigestPayloadFromEvents } from "./makeDigestPayloadFromEvents.ts";
import { readInstanceSettings } from "../../settings/readInstanceSettings.ts";

async function _requeueDigest(
  options: Readonly<{
    transaction: DatabaseExecutor;
    row: OutboundEmailRow;
    baseUrl: string;
    batch: Selectable<Database["notification_digest_batches"]>;
    events: readonly EligibleDigestEvent[];
  }>,
): Promise<void> {
  const settings = await readInstanceSettings({
    database: options.transaction,
    keys: ["shoebox.name"],
  });
  const payload = dailyDigestEmailPayloadSchema.parse({
    ...makeDigestPayloadFromEvents({
      events: options.events,
      window: {
        sendDate: options.batch.send_date,
        timezone: options.batch.timezone,
      },
      baseUrl: options.baseUrl,
    }),
    shoeboxName: settings["shoebox.name"],
    baseUrl: options.baseUrl,
    timezone: options.batch.timezone,
    toDisplayName: null,
    preferencesUrl: `${options.baseUrl.replace(/\/$/, "")}/account`,
  });
  await options.transaction
    .updateTable("outbound_emails")
    .set({
      state: "queued",
      payload_json: JSON.stringify(payload),
      subject: dailyDigestEmail.subject(payload),
      last_error_code: null,
      last_error_message: null,
      next_attempt_at: null,
    })
    .where("id", "=", options.row.id)
    .execute();
}

/** Repairs a configuration-failed digest in place, retaining its batch and key. */
export async function recoverDigestEmail(
  options: Readonly<{
    transaction: DatabaseExecutor;
    row: OutboundEmailRow;
    baseUrl: string;
  }>,
): Promise<boolean> {
  const { transaction, row } = options;
  const batch = await transaction
    .selectFrom("notification_digest_batches")
    .selectAll()
    .where("id", "=", row.trigger_id)
    .executeTakeFirst();
  if (!batch || batch.provider_attempted_at !== null) {
    return false;
  }
  const events = await transaction
    .selectFrom("notification_digest_events")
    .select("id")
    .where("batch_id", "=", batch.id)
    .execute();
  const { eligible } = await readEligibleDigestEvents({
    executor: transaction,
    memberId: batch.member_id,
    eventIds: events.map((event) => {
      return event.id;
    }),
    mode: "delivery",
  });
  if (eligible.length === 0) {
    await transaction
      .updateTable("outbound_emails")
      .set({ state: "cancelled" })
      .where("id", "=", row.id)
      .execute();
    return false;
  }
  await _requeueDigest({ ...options, batch, events: eligible });
  return true;
}
