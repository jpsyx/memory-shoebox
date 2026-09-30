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
 * Replaces one item's tag set, by diff.
 *
 * Four statements whatever the size of the set: one batched
 * `WHERE name_normalized IN (...)` on the unique index, one insert for the
 * genuinely new tags, one delete of the join rows no longer wanted, one insert
 * of the join rows that are. Never one lookup per chip. A collision on
 * creation (see below) adds a fifth, only when one actually happens.
 *
 * **An existing tag keeps its stored `name`.** Typing "hospital" on an item
 * whose archive already spells it "Hospital" attaches the existing row and
 * does not rename it under the other two hundred items carrying it.
 *
 * **`tags` rows are never deleted here.** A tag that ends up on no items is a
 * directory entry with a count of zero, which is a state the timeline renders.
 *
 * **Two members racing to create the same name is handled, not surfaced.**
 * `tags.name_normalized` is `UNIQUE`, and this always runs inside the caller's
 * `BEGIN IMMEDIATE` transaction (`runInImmediateTransaction`), which already
 * serialises every writer in this process against every other, so the window
 * for two inserts of the same name is vanishingly small in practice. It is not
 * zero: nothing here stops a second connection from writing outside that
 * helper, and a second Shoebox instance on the same file is not something this
 * module can rule out. Rather than let SQLite's constraint turn "somebody else
 * typed the same word first" into a 500, the insert uses
 * `ON CONFLICT (name_normalized) DO NOTHING`, the same idiom
 * `enqueueEmail.ts` uses for its idempotency key, and a follow-up read
 * resolves every requested name to whichever row is now canonical, ours or
 * the winner's.
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

  const existing =
    requested.length === 0
      ? []
      : await options.transaction
          .selectFrom("tags")
          .select([
            "tags.id as tagId",
            "tags.name_normalized as nameNormalized",
          ])
          .where(
            "tags.name_normalized",
            "in",
            requested.map((tag) => {
              return tag.nameNormalized;
            }),
          )
          .execute();

  const tagIdByNormalized = new Map(
    existing.map((row) => {
      return [row.nameNormalized, row.tagId];
    }),
  );

  const created = requested
    .filter((tag) => {
      return !tagIdByNormalized.has(tag.nameNormalized);
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

  if (created.length > 0) {
    await options.transaction
      .insertInto("tags")
      .values(created)
      // See the docstring above: a collision here means somebody else's
      // insert of the same normalised name won the race, and that row is the
      // one every item wanting this name should point to.
      .onConflict((conflict) => {
        return conflict.column("name_normalized").doNothing();
      })
      .execute();

    // Re-read rather than trust `created`: whichever row now holds each
    // normalised name, ours or a winner's, is what `tagIdByNormalized` must
    // carry forward.
    const resolved = await options.transaction
      .selectFrom("tags")
      .select(["tags.id as tagId", "tags.name_normalized as nameNormalized"])
      .where(
        "tags.name_normalized",
        "in",
        created.map((tag) => {
          return tag.name_normalized;
        }),
      )
      .execute();
    resolved.forEach((row) => {
      tagIdByNormalized.set(row.nameNormalized, row.tagId);
    });
  }

  const wanted = new Set(
    requested.flatMap((tag) => {
      const tagId = tagIdByNormalized.get(tag.nameNormalized);
      return tagId === undefined ? [] : [tagId];
    }),
  );
  const attached = await options.transaction
    .selectFrom("item_tags")
    .select("item_tags.tag_id as tagId")
    .where("item_tags.item_id", "=", options.itemId)
    .execute();
  const attachedIds = new Set(
    attached.map((row) => {
      return row.tagId;
    }),
  );

  const removed = [...attachedIds].filter((tagId) => {
    return !wanted.has(tagId);
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
  const added = [...wanted].filter((tagId) => {
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
