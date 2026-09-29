import { expressionBuilder } from "kysely";
import type { Database, DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { visibilityExpression } from "../visibility/applyVisibilityFilter.ts";
import { makeNormalisedNameFromName } from "./makeNormalisedNameFromName.ts";

/** One entry of a vocabulary, and what it is worth to this viewer. */
export type VocabularyCount = {
  id: string;
  name: string;
  /** What `q` matches, and the ordering's tiebreak. */
  nameNormalized: string;
  itemCount: number;
};

/** Count descending, then the normalised name, and never anything else. */
function _byCountThenName(
  left: Readonly<VocabularyCount>,
  right: Readonly<VocabularyCount>,
): number {
  return left.itemCount === right.itemCount
    ? left.nameNormalized.localeCompare(right.nameNormalized)
    : right.itemCount - left.itemCount;
}

/**
 * Every tag, with the count this viewer would see.
 *
 * **The predicate sits in the `ON` clause of the join to `items`.** In the
 * `WHERE` the left join collapses to an inner one and every tag whose items
 * are all restricted vanishes from the vocabulary, which makes a type-ahead
 * lie about what exists. The count is `COUNT(i.id)` and never `COUNT(*)`, or
 * the null-extended row gives an unused tag a floor of 1.
 *
 * This one aggregate serves `GET /api/tags` and both the ordering and the
 * `ownCount` of `GET /api/filters/facets`, which is why it is here rather than
 * inside either route. It is the aggregate `timeline.md` asks to be cached per
 * `(memberId, visibilityGeneration)`; nothing writes an item yet, so there is
 * no generation counter to invalidate on, and a cache without one goes stale
 * on the first upload and stays stale.
 *
 * @param options.database The Kysely handle.
 * @param options.viewer The request's viewer.
 */
export async function readTagCounts(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
}): Promise<VocabularyCount[]> {
  const rows = await options.database
    .selectFrom("tags")
    .leftJoin("item_tags", "item_tags.tag_id", "tags.id")
    .leftJoin("items", (join) => {
      return join.onRef("items.id", "=", "item_tags.item_id").on(
        visibilityExpression({
          eb: expressionBuilder<Database, "items">(),
          viewer: options.viewer,
        }),
      );
    })
    .select((eb) => {
      return [
        "tags.id as id",
        "tags.name as name",
        "tags.name_normalized as nameNormalized",
        eb.fn.count<number>("items.id").as("itemCount"),
      ];
    })
    .groupBy(["tags.id", "tags.name", "tags.name_normalized"])
    .execute();

  return rows
    .map((row) => {
      return {
        id: row.id,
        name: row.name,
        nameNormalized: row.nameNormalized,
        itemCount: Number(row.itemCount),
      };
    })
    .sort(_byCountThenName);
}

/**
 * Every person, with the count this viewer would see.
 *
 * The same shape and the same two hazards as {@link readTagCounts}, and one
 * more that matters more here: the person with no `item_people` rows at all is
 * the entire point of surface 7's `zero` state, and both mistakes delete them
 * from the directory.
 *
 * `people` has no normalised column, so the name is normalised in the
 * application, which is also where `q` is applied.
 *
 * @param options.database The Kysely handle.
 * @param options.viewer The request's viewer.
 */
export async function readPersonCounts(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
}): Promise<VocabularyCount[]> {
  const rows = await options.database
    .selectFrom("people")
    .leftJoin("item_people", "item_people.person_id", "people.id")
    .leftJoin("items", (join) => {
      return join.onRef("items.id", "=", "item_people.item_id").on(
        visibilityExpression({
          eb: expressionBuilder<Database, "items">(),
          viewer: options.viewer,
        }),
      );
    })
    .select((eb) => {
      return [
        "people.id as id",
        "people.display_name as name",
        eb.fn.count<number>("items.id").as("itemCount"),
      ];
    })
    .groupBy(["people.id", "people.display_name"])
    .execute();

  return rows
    .map((row) => {
      return {
        id: row.id,
        name: row.name,
        nameNormalized: makeNormalisedNameFromName(row.name),
        itemCount: Number(row.itemCount),
      };
    })
    .sort(_byCountThenName);
}
