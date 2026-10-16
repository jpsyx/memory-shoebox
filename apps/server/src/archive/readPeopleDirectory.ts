import { expressionBuilder } from "kysely";
import type { Expression, SqlBool } from "kysely";
import type {
  DirectoryPerson,
  MediaSource,
  PeopleResponse,
} from "@memory-shoebox/shared";
import { APP_CONFIG } from "../../../../app.config.ts";
import type { B2Client } from "../b2/createB2Client/createB2Client.types.ts";
import type { Database, DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { visibilityExpression } from "../visibility/applyVisibilityFilter.ts";
import { makeNormalisedNameFromName } from "./makeNormalisedNameFromName.ts";
import { readMediaSources } from "./readMediaSources.ts";

/** readFallbackFaceIds inputs or output fields. */
type ReadFallbackFaceIdsShape = {
  database: DatabaseExecutor;
  predicate: Expression<SqlBool>;
  rows: readonly DirectoryRow[];
  visiblePreferredIds: ReadonlySet<string>;
};

/** makeDirectoryResponse inputs or output fields. */
type MakeDirectoryResponseShape = {
  allRows: readonly DirectoryRow[];
  narrowedRows: readonly DirectoryRow[];
  faceItemIds: ReadonlyMap<string, string>;
  mediaSources: ReadonlyMap<string, ReadonlyMap<string, MediaSource>>;
};

/** readPeopleDirectory inputs or output fields. */
type ReadPeopleDirectoryShape = {
  database: DatabaseExecutor;
  b2: B2Client;
  viewer: Viewer;
  search: string | undefined;
  now: Date;
};

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
 * Pass 1 of face resolution: which people's preferred face is visible to
 * this viewer.
 *
 * The preferred face counts only **if that item is visible to this
 * viewer**. A preferred face that exists but is restricted is treated the
 * same as no preference at all, which is what sends that person to
 * {@link _readFallbackFaceIds} instead.
 */
async function _readVisiblePreferredIds(options: {
  database: DatabaseExecutor;
  predicate: Expression<SqlBool>;
  rows: readonly DirectoryRow[];
}): Promise<Set<string>> {
  const preferredIds = options.rows.flatMap((row) => {
    return row.preferredFaceItemId === null ? [] : [row.preferredFaceItemId];
  });
  if (preferredIds.length === 0) {
    return new Set();
  }

  const visiblePreferred = await options.database
    .selectFrom("items")
    .select("items.id as itemId")
    .where("items.id", "in", preferredIds)
    .where(options.predicate)
    .execute();

  return new Set(
    visiblePreferred.map((row) => {
      return row.itemId;
    }),
  );
}

/**
 * Pass 2 of face resolution: the most recent visible item, for everybody
 * pass 1 left without one.
 *
 * One grouped argmax over `item_people`, **not one query per person**:
 * SQLite answers a bare column beside a single `MAX()` from the row that
 * produced the maximum, which is the documented behaviour this relies on.
 */
async function _readFallbackFaceIds(
  options: ReadFallbackFaceIdsShape,
): Promise<Map<string, string>> {
  const stillNeedingFace = options.rows.filter((row) => {
    return (
      row.itemCount > 0 &&
      (row.preferredFaceItemId === null ||
        !options.visiblePreferredIds.has(row.preferredFaceItemId))
    );
  });
  if (stillNeedingFace.length === 0) {
    return new Map();
  }

  const fallbacks = await options.database
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
    .where(options.predicate)
    .groupBy("item_people.person_id")
    .execute();

  return new Map(
    fallbacks.map((row): [string, string] => {
      return [row.personId, row.itemId];
    }),
  );
}

/**
 * The visible face item ID for each person who has an eligible photograph.
 *
 * A visible preferred face wins over the most-recent visible fallback.
 * People with neither have no face and display a placeholder.
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

  const visiblePreferredIds = await _readVisiblePreferredIds({
    database: options.database,
    predicate,
    rows: options.rows,
  });

  const fallbackIds = await _readFallbackFaceIds({
    database: options.database,
    predicate,
    rows: options.rows,
    visiblePreferredIds,
  });

  return new Map([
    ...fallbackIds,
    ...options.rows.flatMap((row): Array<[string, string]> => {
      return row.preferredFaceItemId !== null &&
        visiblePreferredIds.has(row.preferredFaceItemId)
        ? [[row.personId, row.preferredFaceItemId]]
        : [];
    }),
  ]);
}

/**
 * The `q` narrow, and the stable two-key sort every response holds to.
 *
 * `q` is applied here rather than in SQL: the directory is tens of rows, so
 * the filter is free, and it gets "Sofía" and "Papá" right, which SQLite's
 * ASCII-only `LIKE` case folding would not.
 *
 * Ordered by `itemCount` descending then display name, so the people with
 * nothing sort to the end rather than being hidden.
 */
function _narrowAndSortRows(options: {
  rows: readonly DirectoryRow[];
  search: string | undefined;
}): DirectoryRow[] {
  return options.rows
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
}

/**
 * Assembles the route's response from the narrowed rows and their resolved
 * faces.
 *
 * `peopleCount` comes from `allRows`, the whole directory's size before `q`
 * narrows it, so surface 7 can say "6 of 10 people" and nobody concludes
 * somebody has been removed. It is **not** per viewer, which is one of the
 * contract's three documented exceptions: a person's existence is not
 * visibility-scoped, only their photographs are.
 */
function _makeDirectoryResponse(
  options: MakeDirectoryResponseShape,
): PeopleResponse {
  return {
    people: options.narrowedRows.map((row): DirectoryPerson => {
      return {
        person: { personId: row.personId, displayName: row.displayName },
        itemCount: row.itemCount,
        firstCapturedOn: row.firstCapturedOn,
        lastCapturedOn: row.lastCapturedOn,
        face:
          options.mediaSources
            .get(options.faceItemIds.get(row.personId) ?? "")
            ?.values()
            .next().value ?? null,
      };
    }),
    nextCursor: null,
    peopleCount: options.allRows.length,
  };
}

/**
 * The people directory, faces resolved per viewer.
 *
 * @param options.database The Kysely handle.
 * @param options.b2 The Backblaze client, faked in tests.
 * @param options.viewer The request's viewer.
 * @param options.search The `q` parameter, already normalised.
 * @param options.now The request's own clock.
 */
export async function readPeopleDirectory(
  options: Readonly<ReadPeopleDirectoryShape>,
): Promise<PeopleResponse> {
  const rows = await _readDirectoryRows({
    database: options.database,
    viewer: options.viewer,
  });

  const narrowed = _narrowAndSortRows({ rows, search: options.search });

  const faceItemIds = await _readFaceItemIds({
    database: options.database,
    viewer: options.viewer,
    rows: narrowed,
  });

  const { sourcesByItemId: mediaSources } = await readMediaSources({
    database: options.database,
    b2: options.b2,
    purposesByItemId: new Map(
      [...faceItemIds.values()].map((itemId) => {
        return [itemId, "thumbnail"];
      }),
    ),
    now: options.now,
    ttlSeconds: APP_CONFIG.media.signedUrlTtlSeconds,
  });

  return _makeDirectoryResponse({
    allRows: rows,
    narrowedRows: narrowed,
    faceItemIds,
    mediaSources,
  });
}
