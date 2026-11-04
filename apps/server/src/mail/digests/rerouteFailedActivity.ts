import { recordDigestEvent } from "./recordDigestEvent.ts";
import { getActivityFrequencyFromMemberId } from "../getActivityFrequencyFromMemberId.ts";
import type { DatabaseExecutor } from "../../db/types/db.types.ts";
import type { OutboundEmailRow } from "../mailQueue.types.ts";

/** Moves never-attempted activity failures to the current delivery mode once. */
export async function rerouteFailedActivity(
  options: Readonly<{
    transaction: DatabaseExecutor;
    row: OutboundEmailRow;
  }>,
): Promise<boolean> {
  const { transaction, row } = options;
  if (
    (row.kind !== "upload_session" &&
      row.kind !== "comment" &&
      row.kind !== "comment_tag") ||
    row.attempts !== 0 ||
    row.sender_snapshot_json !== null ||
    row.provider_message_id !== null
  ) {
    return false;
  }
  const frequency = await getActivityFrequencyFromMemberId({
    executor: transaction,
    memberId: row.to_member_id,
    kind: row.kind,
  });
  if (frequency === "immediate") {
    return false;
  }
  if (frequency === "daily" && row.to_member_id !== null) {
    await recordDigestEvent({
      executor: transaction,
      memberId: row.to_member_id,
      kind: row.kind,
      sourceId: row.trigger_id,
      occurredAt: row.created_at,
      deduplicationKey: row.idempotency_key,
    });
  }
  await transaction
    .updateTable("outbound_emails")
    .set({ state: "cancelled" })
    .where("id", "=", row.id)
    .where("state", "=", "failed")
    .execute();
  return true;
}
