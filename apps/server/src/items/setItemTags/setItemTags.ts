import type { DatabaseExecutor } from "../../db/types/db.types.ts";

import { getTagIdsFromNames } from "./getTagIdsFromNames.ts";

import { writeTagDiff } from "./writeTagDiff.ts";

/** setItemTags inputs or output fields. */
type SetItemTagsShape = {
  transaction: DatabaseExecutor;
  itemId: string;
  memberId: string;
  names: string[];
  now: string;
};

/**
 * Replaces one item's tag set, by diff.
 *
 * Four statements whatever the size of the set: one batched
 * `WHERE name_normalized IN (...)` on the unique index, one insert for the
 * genuinely new tags, one delete of the join rows no longer wanted, one insert
 * of the join rows that are. Never one lookup per chip. A collision on
 * creation (`_createMissingTags`) adds a fifth, only when one actually
 * happens.
 *
 * @param options.transaction The caller's transaction.
 * @param options.itemId The item.
 * @param options.memberId Who is tagging, for `created_by` and `tagged_by`.
 * @param options.names The names as typed, spaces intact.
 * @param options.now The instant new join rows carry.
 */
export async function setItemTags(
  options: Readonly<Omit<SetItemTagsShape, "names">> &
    Readonly<{ names: readonly string[] }>,
): Promise<void> {
  const tagIdByNormalized = await getTagIdsFromNames({
    transaction: options.transaction,
    names: options.names,
    memberId: options.memberId,
    now: options.now,
  });

  // Only requested names are in the map, so its values are the wanted set.
  await writeTagDiff({
    transaction: options.transaction,
    itemId: options.itemId,
    memberId: options.memberId,
    now: options.now,
    wantedTagIds: new Set(tagIdByNormalized.values()),
  });
}
