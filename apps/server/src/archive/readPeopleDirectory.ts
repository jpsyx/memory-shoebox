import { expressionBuilder } from "kysely";
import type {
  DirectoryPerson,
  MediaSource,
  PeopleResponse,
} from "@memory-shoebox/shared";
import { appConfig } from "../../../../app.config.ts";
import type { B2Client } from "../b2/client.ts";
import type { Database, DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { visibilityExpression } from "../visibility/applyVisibilityFilter.ts";
import { makeNormalisedNameFromName } from "./makeNormalisedNameFromName.ts";
import { readMediaSources } from "./readMediaSources.ts";

/** One person, before their face has been resolved. */
type DirectoryRow = {
  personId: string;
  displayName: string;
  preferredFaceItemId: string | null;
  itemCount: number;
  firstCapturedOn: string | null;
  lastCapturedOn: string | null;
};

/**
 * Query 1: the directory, counted and dated per viewer.
 *
 * > **The single most likely bug in this slice.** The visibility predicate
 * > must sit in the **`ON` clause of the `items` join, not in the `WHERE`**.
 * > In the `WHERE` it filters away the null-extended rows, the left join
 * > collapses to an inner join, and **everybody with no visible items
 * > disappears**, including the person with none at all who is the entire
 * > point of surface 7's `zero` state. The bug is invisible in any fixture
 * > where every person has at least one visible photograph, which is every
 * > fixture anybody writes by hand.
 * >
 * > Its quieter twin: the count must be **`COUNT(i.id)`, never `COUNT(*)`**,
 * > or every person gets a floor of 1 and "Nothing yet" becomes "1 photo and
 * > video".
 */
async function _readDirectoryRows(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
}): Promise<DirectoryRow[]> {
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
        "people.id as personId",
        "people.display_name as displayName",
        "people.preferred_face_item_id as preferredFaceItemId",
        eb.fn.count<number>("items.id").as("itemCount"),
        eb.fn
          .min("items.captured_on")
          .$castTo<string | null>()
          .as("firstCapturedOn"),
        eb.fn
          .max("items.captured_on")
          .$castTo<string | null>()
          .as("lastCapturedOn"),
      ];
    })
    .groupBy([
      "people.id",
      "people.display_name",
      "people.preferred_face_item_id",
    ])
    .execute();

  return rows.map((row) => {
    return { ...row, itemCount: Number(row.itemCount) };
  });
}

/**
 * Queries 2 and 3: one face id per person, or none.
 *
 * The preferred face **if that item is visible to this viewer**, otherwise the
 * most recent visible item tagged with that person, otherwise nothing and the
 * client draws the ghost frame it already has.
 *
 * The fallback is one grouped argmax over `item_people`, **not one query per
 * person**: SQLite answers a bare column beside a single `MAX()` from the row
 * that produced the maximum, which is the documented behaviour this relies on.
 */
async function _readFaceItemIds(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  rows: readonly DirectoryRow[];
}): Promise<Map<string, string>> {
  const predicate = visibilityExpression({
    eb: expressionBuilder<Database, "items">(),
    viewer: options.viewer,
  });

  const preferredIds = options.rows.flatMap((row) => {
    return row.preferredFaceItemId === null ? [] : [row.preferredFaceItemId];
  });
  const visiblePreferred =
    preferredIds.length === 0
      ? []
      : await options.database
          .selectFrom("items")
          .select("items.id as itemId")
          .where("items.id", "in", preferredIds)
          .where(predicate)
          .execute();
  const visiblePreferredIds = new Set(
    visiblePreferred.map((row) => {
      return row.itemId;
    }),
  );

  const stillNeedingFace = options.rows.filter((row) => {
    return (
      row.itemCount > 0 &&
      (row.preferredFaceItemId === null ||
        !visiblePreferredIds.has(row.preferredFaceItemId))
    );
  });

  const fallbacks =
    stillNeedingFace.length === 0
      ? []
      : await options.database
          .selectFrom("item_people")
          .innerJoin("items", "items.id", "item_people.item_id")
          .select((eb) => {
            return [
              "item_people.person_id as personId",
              eb.fn.max("items.captured_at").as("capturedAt"),
              "items.id as itemId",
            ];
          })
          .where(
            "item_people.person_id",
            "in",
            stillNeedingFace.map((row) => {
              return row.personId;
            }),
          )
          .where(predicate)
          .groupBy("item_people.person_id")
          .execute();

  return new Map([
    ...fallbacks.map((row): [string, string] => {
      return [row.personId, row.itemId];
    }),
    ...options.rows.flatMap((row): [string, string][] => {
      return row.preferredFaceItemId !== null &&
        visiblePreferredIds.has(row.preferredFaceItemId)
        ? [[row.personId, row.preferredFaceItemId]]
        : [];
    }),
  ]);
}

/**
 * The people directory, faces resolved per viewer.
 *
 * `peopleCount` is the whole directory's size before `q` narrows it, so
 * surface 7 can say "6 of 10 people" and nobody concludes somebody has been
 * removed. It is **not** per viewer, which is one of the contract's three
 * documented exceptions: a person's existence is not visibility-scoped, only
 * their photographs are.
 *
 * `q` is applied here rather than in SQL: the directory is tens of rows, so
 * the filter is free, it makes `peopleCount` free with it, and it gets "Sofía"
 * and "Papá" right, which SQLite's ASCII-only `LIKE` case folding would not.
 *
 * Ordered by `itemCount` descending then display name, so the people with
 * nothing sort to the end rather than being hidden.
 *
 * @param options.database The Kysely handle.
 * @param options.b2 The Backblaze client, faked in tests.
 * @param options.viewer The request's viewer.
 * @param options.search The `q` parameter, already normalised.
 * @param options.now The request's own clock.
 */
export async function readPeopleDirectory(options: {
  database: DatabaseExecutor;
  b2: B2Client;
  viewer: Viewer;
  search: string | undefined;
  now: Date;
}): Promise<PeopleResponse> {
  const rows = await _readDirectoryRows({
    database: options.database,
    viewer: options.viewer,
  });

  const narrowed = rows
    .filter((row) => {
      return (
        options.search === undefined ||
        makeNormalisedNameFromName(row.displayName).includes(options.search)
      );
    })
    .sort((left, right) => {
      return left.itemCount === right.itemCount
        ? left.displayName.localeCompare(right.displayName)
        : right.itemCount - left.itemCount;
    });

  const faceItemIds = await _readFaceItemIds({
    database: options.database,
    viewer: options.viewer,
    rows: narrowed,
  });

  const mediaSources = await readMediaSources({
    database: options.database,
    b2: options.b2,
    itemIds: [...faceItemIds.values()],
    now: options.now,
    ttlSeconds: appConfig.media.signedUrlTtlSeconds,
  });

  return {
    people: narrowed.map((row): DirectoryPerson => {
      return {
        person: { personId: row.personId, displayName: row.displayName },
        itemCount: row.itemCount,
        firstCapturedOn: row.firstCapturedOn,
        lastCapturedOn: row.lastCapturedOn,
        face: _makeFaceFromSources({
          sources: mediaSources.get(faceItemIds.get(row.personId) ?? ""),
        }),
      };
    }),
    nextCursor: null,
    peopleCount: rows.length,
  };
}

/**
 * The card's thumbnail, and only that.
 *
 * One source rather than a `MediaRef`: the card draws a decorative image with
 * an empty alt and never opens it, so a display URL, video sources and
 * generated alt text would all be minted unread.
 */
function _makeFaceFromSources(options: {
  sources: ReadonlyMap<string, MediaSource> | undefined;
}): MediaSource | null {
  return (
    options.sources?.get("thumb") ??
    options.sources?.get("display") ??
    options.sources?.get("original") ??
    null
  );
}
