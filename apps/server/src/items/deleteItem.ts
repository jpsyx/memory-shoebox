import { writeActivityEvent } from "../activity/writeActivityEvent.ts";
import { createId } from "../db/createId.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { closeOpenRemovalRequests } from "./closeOpenRemovalRequests.ts";
import type { VisibleItem } from "./getVisibleItemOr404.ts";

/**
 * Enqueues every stored object the cascade is about to orphan.
 *
 * In the caller's transaction, and read before the delete, because the rows
 * naming these keys are gone a statement later. No foreign key performs this,
 * and no transaction spans SQLite and Backblaze: the rows must commit first so
 * the item genuinely vanishes, and without this table a B2 failure leaves a
 * family paying to store a photograph they were told was destroyed.
 * `object-deletion-drain` takes it from there.
 */
async function _enqueueObjectDeletions(options: {
  transaction: DatabaseExecutor;
  storageKeys: readonly string[];
  now: string;
}): Promise<void> {
  if (options.storageKeys.length === 0) {
    return;
  }

  await options.transaction
    .insertInto("pending_object_deletions")
    .values(
      options.storageKeys.map((storageKey) => {
        return {
          id: createId(),
          storage_key: storageKey,
          attempts: 0,
          last_error: null,
          created_at: options.now,
          last_attempted_at: null,
        };
      }),
    )
    .onConflict((conflict) => {
      // Enqueueing the same key twice is one object to delete, not two
      // attempts, and the unique index on `storage_key` says so.
      return conflict.column("storage_key").doNothing();
    })
    .execute();
}

/**
 * Drops the burst once its last frame has gone.
 *
 * Application code, because no foreign key direction does this. One remaining
 * frame does not drop it: a burst of one visible frame renders as a plain
 * print, which is a read-time rule rather than a stored state.
 */
async function _dropBurstIfItIsNowEmpty(options: {
  transaction: DatabaseExecutor;
  burstId: string | null;
}): Promise<void> {
  const { burstId } = options;
  if (burstId === null) {
    return;
  }

  const remaining = await options.transaction
    .selectFrom("items")
    .select("items.id as itemId")
    .where("items.burst_id", "=", burstId)
    .limit(1)
    .executeTakeFirst();

  if (remaining === undefined) {
    await options.transaction
      .deleteFrom("bursts")
      .where("id", "=", burstId)
      .execute();
  }
}

/**
 * Destroys one photograph, and the bytes with it.
 *
 * **Nothing blocks.** Not an open removal request, because deleting is how you
 * grant one, and not a burst with forty-four siblings, because deleting one
 * frame of forty-five is ordinary. There is no `409` in this route's table.
 *
 * Two steps must precede the delete for reasons no foreign key expresses:
 *
 * 1. The **storage keys** have to be read while the rows still exist, and
 *    enqueued in this same transaction, since `item_renditions` cascades away
 *    with the item and nothing else will ever name those objects again.
 * 2. The **removal requests** have to be closed while
 *    `removal_requests.item_id` still points at the item, because it is
 *    `SET NULL` and the rows become unfindable by item the instant the item
 *    goes.
 *
 * The engine then performs the whole matrix (`data-models.md` § Deleting an
 * item): comments (and `comment_reactions` transitively), `item_reactions`,
 * `item_tags`, `item_people`, `item_milestones`, `item_views`,
 * `item_renditions` and `item_capture_date_changes` all CASCADE;
 * `upload_files.item_id` and `removal_requests.item_id` SET NULL;
 * `bursts.cover_item_id` SET NULL. `tags`, `people`, `milestones` and
 * `members` all survive, and `visibility_rules` is untouched because rules are
 * shared and the daily `visibility-rule-sweep` drops the unreferenced ones.
 *
 * @param options.transaction The caller's transaction.
 * @param options.viewer Who is deleting it, already guarded.
 * @param options.item The item, already resolved.
 * @param options.now The instant every row written here carries.
 */
export async function deleteItem(options: {
  transaction: DatabaseExecutor;
  viewer: Viewer;
  item: VisibleItem;
  now: string;
}): Promise<void> {
  const { item, transaction } = options;

  // 1. Read what the cascade is about to destroy, while it still exists.
  const renditions = await transaction
    .selectFrom("item_renditions")
    .select("item_renditions.storage_key as storageKey")
    .where("item_renditions.item_id", "=", item.itemId)
    .execute();

  // 2. Enqueue the objects, in this same transaction.
  await _enqueueObjectDeletions({
    transaction,
    storageKeys: renditions.map((rendition) => {
      return rendition.storageKey;
    }),
    now: options.now,
  });

  // 3. Close the removal requests while they can still be found by item. The
  //    rows returned are step 7a's seam: its `removal_resolved` enqueue drops
  //    in here without reshaping this transaction.
  await closeOpenRemovalRequests({
    transaction,
    itemId: item.itemId,
    resolvedByMemberId: options.viewer.memberId,
    now: options.now,
  });

  // 4. The only record anywhere that the item existed. Composed now, while
  //    the row is still readable; `subject_id` is a dangling id by design.
  await writeActivityEvent({
    transaction,
    viewer: options.viewer,
    kind: "item_deleted",
    subjectKind: "item",
    subjectId: item.itemId,
    subjectLabel: `A ${item.kind} from ${item.capturedOn}`,
    now: options.now,
  });

  // 5. The engine performs the matrix in the docstring above.
  await transaction.deleteFrom("items").where("id", "=", item.itemId).execute();

  // 6. Drop the burst when its last frame goes.
  await _dropBurstIfItIsNowEmpty({ transaction, burstId: item.burstId });
}
