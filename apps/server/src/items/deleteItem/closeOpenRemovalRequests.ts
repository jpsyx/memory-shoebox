import { enqueueRemovalEmails } from "../../removals/enqueueRemovalEmails/enqueueRemovalEmails.ts";
import type { DatabaseExecutor } from "../../db/types/db.types.ts";

type SettleOpenRequestsOptions = {
  transaction: DatabaseExecutor;
  requestIds: readonly string[];
  resolvedByMemberId: string;
  now: string;
};

type CloseOpenRemovalRequestsOptions = {
  transaction: DatabaseExecutor;
  itemId: string;
  resolvedByMemberId: string;
  now: string;
};

/** One request this delete answered, for whoever notifies its author. */
export type ClosedRemovalRequest = {
  requestId: string;
  requestedByMemberId: string;
};

async function _settleOpenRequests(
  options: Readonly<SettleOpenRequestsOptions>,
): Promise<void> {
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
    .where("id", "in", options.requestIds)
    .where("state", "=", "open")
    .execute();
}

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
 * Reads the complete snapshot and enqueues deleted answers in this same
 * transaction, before the item and legacy fallback facts disappear.
 *
 * @param options.transaction The delete's own transaction.
 * @param options.itemId The item about to be destroyed.
 * @param options.resolvedByMemberId Whoever is deleting it.
 * @param options.now The instant recorded.
 * @returns The requests this delete answered.
 */
export async function closeOpenRemovalRequests(
  options: Readonly<CloseOpenRemovalRequestsOptions>,
): Promise<ClosedRemovalRequest[]> {
  const open = await options.transaction
    .selectFrom("removal_requests")
    .selectAll()
    .where("removal_requests.item_id", "=", options.itemId)
    .where("removal_requests.state", "=", "open")
    .execute();

  if (open.length === 0) {
    return [];
  }

  await _settleOpenRequests({
    ...options,
    requestIds: open.map((request) => {
      return request.id;
    }),
  });

  await enqueueRemovalEmails({
    transaction: options.transaction,
    requests: open,
    event: "deleted",
    actorMemberId: options.resolvedByMemberId,
    now: options.now,
  });
  return open.map((request) => {
    return {
      requestId: request.id,
      requestedByMemberId: request.requested_by_member_id,
    };
  });
}
