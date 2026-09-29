import type {
  FilterFacetsResponse,
  PersonFacet,
  TagFacet,
} from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { countSelectedItems } from "./countSelectedItems.ts";
import {
  hasAnyFilter,
  makeSelectionExpressionFromFilter,
  type TimelineFilter,
} from "./selectionFilter.ts";
import {
  readPersonCounts,
  readTagCounts,
  type VocabularyCount,
} from "./readVocabularyCounts.ts";

/**
 * The tail both narrowed-count queries share: a plain `Map<string, number>`
 * built from rows Kysely already grouped.
 *
 * Split out only because the last line repeats character for character, not
 * because the two queries above it could merge: Kysely types a table name as
 * a literal rather than a union, so `item_tags` and `item_people` still need
 * their own query bodies, each ending in a call to this.
 */
function _makeCountMapFromRows(
  rows: ReadonlyArray<{ id: string; itemCount: number }>,
): Map<string, number> {
  return new Map(
    rows.map((row) => {
      return [String(row.id), Number(row.itemCount)];
    }),
  );
}

/**
 * `|selection ∩ tag|` for every tag at once.
 *
 * The saving grace of Decision 13: grouping by `tag_id` over the
 * already-selected item set yields every chip's narrowed count in **one pass**
 * rather than one query per chip, which is exactly the narrow semantics.
 *
 * Kept as its own function, rather than one parameterised over the join
 * table, because Kysely's builder types the table name as a literal: a
 * shared body typed over the union of `item_tags` and `item_people` cannot
 * express either table's own columns.
 */
async function _readNarrowedTagCounts(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  filter: Readonly<TimelineFilter>;
}): Promise<Map<string, number>> {
  const rows = await options.database
    .selectFrom("item_tags")
    .innerJoin("items", "items.id", "item_tags.item_id")
    .select((eb) => {
      return [
        "item_tags.tag_id as id",
        eb.fn.countAll<number>().as("itemCount"),
      ];
    })
    .where(
      makeSelectionExpressionFromFilter({
        viewer: options.viewer,
        filter: options.filter,
      }),
    )
    .groupBy("item_tags.tag_id")
    .execute();

  return _makeCountMapFromRows(rows);
}

/** `|selection ∩ person|` for every person at once: {@link _readNarrowedTagCounts}, over `item_people`. */
async function _readNarrowedPersonCounts(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  filter: Readonly<TimelineFilter>;
}): Promise<Map<string, number>> {
  const rows = await options.database
    .selectFrom("item_people")
    .innerJoin("items", "items.id", "item_people.item_id")
    .select((eb) => {
      return [
        "item_people.person_id as id",
        eb.fn.countAll<number>().as("itemCount"),
      ];
    })
    .where(
      makeSelectionExpressionFromFilter({
        viewer: options.viewer,
        filter: options.filter,
      }),
    )
    .groupBy("item_people.person_id")
    .execute();

  return _makeCountMapFromRows(rows);
}

/** One chip's two counts, of which exactly one is ever non-null. */
function _makeCounts(options: {
  count: Readonly<VocabularyCount>;
  isSelected: boolean;
  narrowed: ReadonlyMap<string, number>;
}): { narrowedCount: number | null; ownCount: number | null } {
  return options.isSelected
    ? { narrowedCount: null, ownCount: options.count.itemCount }
    : {
        narrowedCount: options.narrowed.get(options.count.id) ?? 0,
        ownCount: null,
      };
}

/**
 * Every chip's narrowed count, and the live result count, in one batch.
 *
 * With nothing selected the narrowed counts are just the unfiltered ones and
 * no grouped query runs, which is the shortcut this function owns:
 * {@link _readNarrowedTagCounts} and {@link _readNarrowedPersonCounts} only
 * ever run for a real selection. `resultCount` still asks the database even
 * then, because the vocabulary's unfiltered totals cannot answer it: an item
 * carrying no tags appears in no tag group, so summing the vocabulary
 * undercounts the archive.
 */
async function _readNarrowedCounts(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  filter: Readonly<TimelineFilter>;
  tagCounts: readonly VocabularyCount[];
  personCounts: readonly VocabularyCount[];
}): Promise<{
  narrowedTags: Map<string, number>;
  narrowedPeople: Map<string, number>;
  resultCount: number;
}> {
  const isSelectionEmpty = !hasAnyFilter(options.filter);
  const unfilteredMap = (counts: readonly VocabularyCount[]) => {
    return new Map(
      counts.map((count) => {
        return [count.id, count.itemCount];
      }),
    );
  };

  const [narrowedTags, narrowedPeople, resultCount] = await Promise.all([
    isSelectionEmpty
      ? Promise.resolve(unfilteredMap(options.tagCounts))
      : _readNarrowedTagCounts({
          database: options.database,
          viewer: options.viewer,
          filter: options.filter,
        }),
    isSelectionEmpty
      ? Promise.resolve(unfilteredMap(options.personCounts))
      : _readNarrowedPersonCounts({
          database: options.database,
          viewer: options.viewer,
          filter: options.filter,
        }),
    countSelectedItems({
      database: options.database,
      viewer: options.viewer,
      filter: options.filter,
    }),
  ]);

  return { narrowedTags, narrowedPeople, resultCount };
}

/**
 * Every chip on the filter surface, with what pressing it would leave.
 *
 * Three things the shape enforces and the copy depends on:
 *
 * - **Counts narrow.** `narrowedCount` is what adding that chip to the current
 *   selection would leave, never what the chip is worth alone.
 * - **A zero-count chip stays on the row and goes quiet.** Dropping it would
 *   reshuffle a row under somebody's finger, and `0` is itself the answer to
 *   "is there anything from the beach with Abuela in it".
 * - **The row's order never changes with the selection.** Both arrays are
 *   ordered by the viewer's **unfiltered** count descending, then name, and
 *   that order is held across every recomputation.
 *
 * @param options.database The Kysely handle.
 * @param options.viewer The request's viewer.
 * @param options.filter The selection as it stands.
 */
export async function readFacets(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  filter: Readonly<TimelineFilter>;
}): Promise<FilterFacetsResponse> {
  const [tagCounts, personCounts] = await Promise.all([
    readTagCounts({ database: options.database, viewer: options.viewer }),
    readPersonCounts({ database: options.database, viewer: options.viewer }),
  ]);

  const { narrowedTags, narrowedPeople, resultCount } =
    await _readNarrowedCounts({
      database: options.database,
      viewer: options.viewer,
      filter: options.filter,
      tagCounts,
      personCounts,
    });

  const tags: TagFacet[] = tagCounts.map((count) => {
    const isSelected = options.filter.tagIds.includes(count.id);
    return {
      tag: { tagId: count.id, name: count.name },
      isSelected,
      ..._makeCounts({ count, isSelected, narrowed: narrowedTags }),
    };
  });

  const people: PersonFacet[] = personCounts.map((count) => {
    const isSelected = options.filter.personIds.includes(count.id);
    return {
      person: { personId: count.id, displayName: count.name },
      isSelected,
      ..._makeCounts({ count, isSelected, narrowed: narrowedPeople }),
    };
  });

  return { tags, people, resultCount };
}
