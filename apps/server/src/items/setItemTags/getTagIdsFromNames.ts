import { makeNormalisedNameFromName } from "../../archive/makeNormalisedNameFromName.ts";

import { createId } from "../../db/createId.ts";

import type { DatabaseExecutor } from "../../db/types/db.types.ts";

import type {
  RequestedTag,
  GetTagIdsFromNamesOptions,
} from "./setItemTags.types.ts";

/** createMissingTags inputs or output fields. */
type CreateMissingTagsShape = {
  transaction: DatabaseExecutor;
  requested: RequestedTag[];
  tagIdByNormalized: Map<string, string>;
  memberId: string;
  now: string;
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
async function _createMissingTags(
  options: Readonly<
    Omit<CreateMissingTagsShape, "requested" | "tagIdByNormalized">
  > &
    Readonly<{
      requested: readonly RequestedTag[];
      tagIdByNormalized: ReadonlyMap<string, string>;
    }>,
): Promise<Map<string, string>> {
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
 * Finds or creates one tag per distinct normalised name and returns its id
 * keyed by the normalised form.
 *
 * Shared by per-item tagging and upload ingest: "Hospital" and "hospital" find
 * the same tag. An existing tag keeps its stored name; matching a differently
 * cased input never renames it.
 *
 * @param options.transaction The caller's transaction.
 * @param options.names The names as typed, spaces intact.
 * @param options.memberId Who is tagging, for a new tag's `created_by`.
 * @param options.now The instant a new tag carries.
 */
export async function getTagIdsFromNames(
  options: Readonly<Omit<GetTagIdsFromNamesOptions, "names">> &
    Readonly<{ names: readonly string[] }>,
): Promise<Map<string, string>> {
  // Use one batched lookup on the unique index and one insert for new names;
  // re-read only after an insert.

  const requested = _makeRequestedTags(options.names);
  const tagIdByNormalized = await _getTagIdByNormalized({
    transaction: options.transaction,
    nameNormalizedList: requested.map((tag) => {
      return tag.nameNormalized;
    }),
  });

  // Re-read rather than trust the map above: whichever row now holds each
  // normalised name, ours or a winner's, is what carries forward.
  const createdIds = await _createMissingTags({
    transaction: options.transaction,
    requested,
    tagIdByNormalized,
    memberId: options.memberId,
    now: options.now,
  });
  createdIds.forEach((tagId, nameNormalized) => {
    tagIdByNormalized.set(nameNormalized, tagId);
  });
  return tagIdByNormalized;
}
