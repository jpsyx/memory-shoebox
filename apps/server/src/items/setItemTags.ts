import { makeNormalisedNameFromName } from "../archive/makeNormalisedNameFromName.ts";
import { createId } from "../db/createId.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";

/** One requested name, with the form the database matches on. */
type RequestedTag = {
  name: string;
  nameNormalized: string;
};

/**
 * The requested names, deduplicated on the normalised form, in the order they
 * arrived.
 */
function _makeRequestedTags(names: readonly string[]): RequestedTag[] {
  return [
    ...names
      .reduce<Map<string, RequestedTag>>((unique, name) => {
        const nameNormalized = makeNormalisedNameFromName(name);
        if (!unique.has(nameNormalized)) {
          unique.set(nameNormalized, { name: name.trim(), nameNormalized });
        }
        return unique;
      }, new Map())
      .values(),
  ];
}

/**
 * Existing tags matching the given normalised names, by that name.
 *
 * Shared by the initial lookup and, after `_createMissingTags` inserts, the
 * re-read that settles which row a race actually left canonical.
 */
async function _getTagIdByNormalized(options: {
  transaction: DatabaseExecutor;
  nameNormalizedList: readonly string[];
}): Promise<Map<string, string>> {
  if (options.nameNormalizedList.length === 0) {
    return new Map();
  }

  const rows = await options.transaction
    .selectFrom("tags")
    .select(["tags.id as tagId", "tags.name_normalized as nameNormalized"])
    .where("tags.name_normalized", "in", options.nameNormalizedList)
    .execute();

  return new Map(
    rows.map((row) => {
      return [row.nameNormalized, row.tagId];
    }),
  );
}

/**
 * Creates whichever requested names have no existing tag, and returns the id
 * each now resolves to, ours or a winner's of the same race.
 *
 * **Two members racing to create the same name is handled, not surfaced.**
 * `tags.name_normalized` is `UNIQUE`, and this always runs inside the
 * caller's `BEGIN IMMEDIATE` transaction (`runInImmediateTransaction`), which
 * already serialises every writer in this process against every other, so
 * the window for two inserts of the same name is vanishingly small in
 * practice. It is not zero: nothing here stops a second connection from
 * writing outside that helper, and a second Shoebox instance on the same
 * file is not something this module can rule out. Rather than let SQLite's
 * constraint turn "somebody else typed the same word first" into a 500, the
 * insert uses `ON CONFLICT (name_normalized) DO NOTHING`, the same idiom
 * `enqueueEmail.ts` uses for its idempotency key, and a follow-up read
 * resolves every requested name to whichever row is now canonical.
 */
async function _createMissingTags(options: {
  transaction: DatabaseExecutor;
  requested: readonly RequestedTag[];
  tagIdByNormalized: ReadonlyMap<string, string>;
  memberId: string;
  now: string;
}): Promise<Map<string, string>> {
  const created = options.requested
    .filter((tag) => {
      return !options.tagIdByNormalized.has(tag.nameNormalized);
    })
    .map((tag) => {
      return {
        id: createId(),
        name: tag.name,
        name_normalized: tag.nameNormalized,
        created_by: options.memberId,
        created_at: options.now,
      };
    });

  if (created.length === 0) {
    return new Map();
  }

  await options.transaction
    .insertInto("tags")
    .values(created)
    .onConflict((conflict) => {
      return conflict.column("name_normalized").doNothing();
    })
    .execute();

  return _getTagIdByNormalized({
    transaction: options.transaction,
    nameNormalizedList: created.map((tag) => {
      return tag.name_normalized;
    }),
  });
}

/**
 * The tag ids the item should end up with, creating any that don't exist.
 *
 * **An existing tag keeps its stored `name`.** Typing "hospital" on an item
 * whose archive already spells it "Hospital" attaches the existing row and
 * does not rename it under the other two hundred items carrying it.
 */
async function _getWantedTagIds(options: {
  transaction: DatabaseExecutor;
  requested: readonly RequestedTag[];
  memberId: string;
  now: string;
}): Promise<Set<string>> {
  const tagIdByNormalized = await _getTagIdByNormalized({
    transaction: options.transaction,
    nameNormalizedList: options.requested.map((tag) => {
      return tag.nameNormalized;
    }),
  });

  // Re-read rather than trust the map above: whichever row now holds each
  // normalised name, ours or a winner's, is what carries forward.
  const createdIds = await _createMissingTags({
    transaction: options.transaction,
    requested: options.requested,
    tagIdByNormalized,
    memberId: options.memberId,
    now: options.now,
  });
  createdIds.forEach((tagId, nameNormalized) => {
    tagIdByNormalized.set(nameNormalized, tagId);
  });

  return new Set(
    options.requested.flatMap((tag) => {
      const tagId = tagIdByNormalized.get(tag.nameNormalized);
      return tagId === undefined ? [] : [tagId];
    }),
  );
}

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
async function _writeTagDiff(options: {
  transaction: DatabaseExecutor;
  itemId: string;
  memberId: string;
  now: string;
  wantedTagIds: ReadonlySet<string>;
}): Promise<void> {
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
export async function setItemTags(options: {
  transaction: DatabaseExecutor;
  itemId: string;
  memberId: string;
  names: readonly string[];
  now: string;
}): Promise<void> {
  const requested = _makeRequestedTags(options.names);

  const wantedTagIds = await _getWantedTagIds({
    transaction: options.transaction,
    requested,
    memberId: options.memberId,
    now: options.now,
  });

  await _writeTagDiff({
    transaction: options.transaction,
    itemId: options.itemId,
    memberId: options.memberId,
    now: options.now,
    wantedTagIds,
  });
}
