import { createId } from "../../db/createId.ts";

import type { DatabaseExecutor } from "../../db/types/db.types.ts";

/** writeTagDiff inputs or output fields. */
type WriteTagDiffShape = {
  transaction: DatabaseExecutor;
  itemId: string;
  memberId: string;
  now: string;
  wantedTagIds: Set<string>;
};

/** The tag ids currently attached to the item. */
async function _getAttachedTagIds(options: {
  transaction: DatabaseExecutor;
  itemId: string;
}): Promise<Set<string>> {
  const attached = await options.transaction
    .selectFrom("item_tags")
    .select("item_tags.tag_id as tagId")
    .where("item_tags.item_id", "=", options.itemId)
    .execute();

  return new Set(
    attached.map((row) => {
      return row.tagId;
    }),
  );
}

/**
 * Attaches and detaches join rows so the item ends up with exactly the
 * wanted set.
 *
 * **`tags` rows are never deleted here.** A tag that ends up on no items is a
 * directory entry with a count of zero, which is a state the timeline
 * renders.
 */
export async function writeTagDiff(
  options: Readonly<Omit<WriteTagDiffShape, "wantedTagIds">> &
    Readonly<{ wantedTagIds: ReadonlySet<string> }>,
): Promise<void> {
  const attachedIds = await _getAttachedTagIds({
    transaction: options.transaction,
    itemId: options.itemId,
  });

  const removed = [...attachedIds].filter((tagId) => {
    return !options.wantedTagIds.has(tagId);
  });
  if (removed.length > 0) {
    await options.transaction
      .deleteFrom("item_tags")
      .where("item_id", "=", options.itemId)
      .where("tag_id", "in", removed)
      .execute();
  }

  // Only the genuinely new joins, so the provenance of a tag nobody touched
  // is left exactly as it was.
  const added = [...options.wantedTagIds].filter((tagId) => {
    return !attachedIds.has(tagId);
  });
  if (added.length > 0) {
    await options.transaction
      .insertInto("item_tags")
      .values(
        added.map((tagId) => {
          return {
            id: createId(),
            item_id: options.itemId,
            tag_id: tagId,
            tagged_by: options.memberId,
            tagged_at: options.now,
          };
        }),
      )
      .execute();
  }
}
