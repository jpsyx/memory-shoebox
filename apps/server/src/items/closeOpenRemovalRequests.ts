import type { DatabaseExecutor } from "../db/types/db.types.ts";

/** One request this delete answered, for whoever notifies its author. */
export type ClosedRemovalRequest = {
  requestId: string;
  requestedByMemberId: string;
};

/**
 * Resolves every open removal request on one item, because the photograph is
 * about to go.
 *
 * **All of them, not the one being answered**, and the deleter may be an admin
 * rather than the uploader: two cousins tagged in one photograph both asked,
 * and one delete answers both.
 *
 * **It must run before the item is deleted.** `removal_requests.item_id` is
 * `SET NULL` on delete, the one exception to cascade in the whole schema, so
 * the rows become unfindable by item the instant the item goes.
 *
 * **The transition semantics and the notification are handled elsewhere.**
 * This writes the two columns that transition needs and returns the rows it
 * closed, so a `removal_resolved` enqueue drops in here without reshaping the
 * delete transaction. It deliberately sends nothing: no copy for that kind
 * has been written, and the mail registry is typed so a kind with no template
 * cannot be enqueued at all.
 *
 * @param options.transaction The delete's own transaction.
 * @param options.itemId The item about to be destroyed.
 * @param options.resolvedByMemberId Whoever is deleting it.
 * @param options.now The instant recorded.
 * @returns The requests this delete answered.
 */
export async function closeOpenRemovalRequests(options: {
  transaction: DatabaseExecutor;
  itemId: string;
  resolvedByMemberId: string;
  now: string;
}): Promise<ClosedRemovalRequest[]> {
  const open = await options.transaction
    .selectFrom("removal_requests")
    .select([
      "removal_requests.id as requestId",
      "removal_requests.requested_by_member_id as requestedByMemberId",
    ])
    .where("removal_requests.item_id", "=", options.itemId)
    .where("removal_requests.state", "=", "open")
    .execute();

  if (open.length === 0) {
    return [];
  }

  // `(state = 'open') = (resolved_at IS NULL)` is an equivalence the database
  // enforces, so the state and the timestamp move together or the write is
  // refused.
  await options.transaction
    .updateTable("removal_requests")
    .set({
      state: "deleted",
      resolved_at: options.now,
      resolved_by_member_id: options.resolvedByMemberId,
    })
    .where(
      "id",
      "in",
      open.map((row) => {
        return row.requestId;
      }),
    )
    .execute();

  return open;
}
