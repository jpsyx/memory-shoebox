import { createId } from "../../db/createId.ts";
import type { DatabaseExecutor } from "../../db/types/db.types.ts";

/** Records one lifetime source/recipient event inside the caller's transaction. */
export async function recordDigestEvent(
  options: Readonly<{
    executor: DatabaseExecutor;
    memberId: string;
    kind: "upload_session" | "comment" | "comment_tag";
    sourceId: string;
    occurredAt: string;
    deduplicationKey: string;
  }>,
): Promise<void> {
  await options.executor
    .insertInto("notification_digest_events")
    .values({
      id: createId(),
      member_id: options.memberId,
      category: options.kind === "upload_session" ? "upload" : options.kind,
      source_kind:
        options.kind === "upload_session" ? "upload_session" : "comment",
      source_id: options.sourceId,
      occurred_at: options.occurredAt,
      deduplication_key: options.deduplicationKey,
      state: "pending",
      batch_id: null,
    })
    .onConflict((conflict) => {
      return conflict.column("deduplication_key").doNothing();
    })
    .execute();
}
