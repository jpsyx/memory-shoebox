import type {
  MediaRef,
  MediaSource,
  UploadFileDto,
  UploadFileState,
} from "@memory-shoebox/shared";
import { appConfig } from "../../../../app.config.ts";
import { makeAltTextFromItem } from "../archive/makeAltTextFromItem.ts";
import { makeMediaRefFromSources } from "../archive/makeMediaRefFromSources.ts";
import { readMediaSources } from "../archive/readMediaSources.ts";
import { readPeopleNamesByItemId } from "../archive/readPeopleNamesByItemId.ts";
import type { B2Client } from "../b2/client/client.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { ApiError } from "../http/ApiError.ts";
import { readInstanceSettings } from "../settings/readInstanceSettings.ts";
import {
  getPositionFromUploadFileCursor,
  makeUploadFileCursorFromPosition,
} from "./uploadFileCursorHelpers.ts";
import type { UploadFileRow } from "./uploadSessionAccess.ts";
import {
  getCaptureSourceFromStoredValue,
  getUploadFileStateFromStoredValue,
  getUploadProblemCodeFromStoredValue,
} from "./uploadStateHelpers.ts";

/** One page of the embedded file list, as the session detail asks for it. */
export type UploadFilePageRequest = {
  limit: number;
  /** Opaque, from a previous page's `nextCursor`. Null for the first page. */
  cursor: string | null;
  /** Null means every state. */
  states: UploadFileState[] | null;
};

/** One page of files, and where the next one starts. */
export type UploadFilePage = {
  files: UploadFileDto[];
  nextCursor: string | null;
};

/** What one page's files are read with. */
type FileRowFilter = {
  sessionId: string;
  afterPosition?: number;
  states: readonly UploadFileState[] | null;
  limit: number;
};

/** The item columns a landed file's `MediaRef` is composed from. */
type ItemMediaRow = {
  itemId: string;
  capturedAt: string;
  durationMs: number | null;
  altText: string | null;
};

/** The files of one session, in manifest order, one page of them. */
async function _readFileRows(options: {
  database: DatabaseExecutor;
  filter: Readonly<FileRowFilter>;
}): Promise<UploadFileRow[]> {
  const { filter } = options;
  const base = options.database
    .selectFrom("upload_files")
    .selectAll()
    .where("upload_session_id", "=", filter.sessionId);
  const afterCursor =
    filter.afterPosition === undefined
      ? base
      : base.where("position", ">", filter.afterPosition);
  const byState =
    filter.states === null
      ? afterCursor
      : afterCursor.where("state", "in", [...filter.states]);

  return byState.orderBy("position", "asc").limit(filter.limit).execute();
}

/** The four reads a set of rows' media costs, keyed by their item ids. */
type MediaLookups = {
  items: ReadonlyMap<string, ItemMediaRow>;
  sources: ReadonlyMap<string, ReadonlyMap<string, MediaSource>>;
  peopleNames: ReadonlyMap<string, string[]>;
  timezone: string;
};

/** The items the rows became, in one query keyed by their ids. */
async function _readItemMediaRows(options: {
  database: DatabaseExecutor;
  itemIds: readonly string[];
}): Promise<Map<string, ItemMediaRow>> {
  const rows = await options.database
    .selectFrom("items")
    .select([
      "items.id as itemId",
      "items.captured_at as capturedAt",
      "items.duration_ms as durationMs",
      "items.alt_text as altText",
    ])
    .where("items.id", "in", [...options.itemIds])
    .execute();
  return new Map(
    rows.map((row) => {
      return [row.itemId, row] as const;
    }),
  );
}

/**
 * **One batched renditions query for all the rows**, keyed by their item
 * ids, never a join per file (`data-models.md` § `item_renditions`), and the
 * signed URLs are minted in that one pass. The items, the people names and
 * the zone are the other reads the composed alt text needs.
 */
async function _readMediaLookups(options: {
  database: DatabaseExecutor;
  b2: B2Client;
  now: Date;
  itemIds: readonly string[];
}): Promise<MediaLookups> {
  const [items, sources, peopleNames, settings] = await Promise.all([
    _readItemMediaRows(options),
    readMediaSources({
      database: options.database,
      b2: options.b2,
      itemIds: options.itemIds,
      now: options.now,
      ttlSeconds: appConfig.media.signedUrlTtlSeconds,
    }),
    readPeopleNamesByItemId({
      database: options.database,
      itemIds: options.itemIds,
    }),
    readInstanceSettings({
      database: options.database,
      keys: ["shoebox.timezone"],
    }),
  ]);
  return {
    items,
    sources,
    peopleNames,
    timezone: settings["shoebox.timezone"],
  };
}

/** One item's print, or nothing when its renditions are missing. */
function _makeMediaRefFromItem(options: {
  item: Readonly<ItemMediaRow>;
  lookups: MediaLookups;
}): MediaRef | undefined {
  const { item, lookups } = options;
  return makeMediaRefFromSources({
    sources: lookups.sources.get(item.itemId) ?? new Map(),
    durationMs: item.durationMs,
    altText: makeAltTextFromItem({
      altTextOverride: item.altText,
      personNames: lookups.peopleNames.get(item.itemId) ?? [],
      capturedAt: item.capturedAt,
      timezone: lookups.timezone,
    }),
  });
}

/** Every `MediaRef` the rows' items are drawn with, by item id. */
async function _readMediaByItemId(options: {
  database: DatabaseExecutor;
  b2: B2Client;
  now: Date;
  fileRows: readonly UploadFileRow[];
}): Promise<Map<string, MediaRef>> {
  const itemIds = [
    ...new Set(
      options.fileRows.flatMap((row) => {
        return row.item_id === null ? [] : [row.item_id];
      }),
    ),
  ];
  if (itemIds.length === 0) {
    return new Map();
  }
  const lookups = await _readMediaLookups({ ...options, itemIds });

  return new Map(
    itemIds.flatMap((itemId) => {
      const item = lookups.items.get(itemId);
      const media =
        item === undefined
          ? undefined
          : _makeMediaRefFromItem({ item, lookups });
      return media === undefined ? [] : [[itemId, media] as const];
    }),
  );
}

/** One row and its media as the DTO the surface draws. */
function _makeUploadFileDtoFromRow(options: {
  row: Readonly<UploadFileRow>;
  mediaByItemId: ReadonlyMap<string, MediaRef>;
}): UploadFileDto {
  const { row } = options;
  return {
    fileId: row.id,
    position: row.position,
    originalFilename: row.original_filename,
    declaredContentType: row.declared_content_type,
    declaredBytes: row.declared_bytes,
    contentHash: row.content_hash,
    state: getUploadFileStateFromStoredValue(row.state),
    attemptCount: row.attempt_count,
    problemCode: getUploadProblemCodeFromStoredValue(row.problem_code),
    problemDetail: row.problem_detail,
    capturedAt: row.captured_at,
    capturedOn: row.capture_date,
    captureOffsetMinutes: row.capture_offset_minutes,
    captureSource: getCaptureSourceFromStoredValue(row.capture_source),
    itemId: row.item_id,
    // Null until ingest, which is also the honest answer on resume: the
    // browser no longer holds the `File`, so a landed file has no thumbnail
    // of its own to draw until it is an item.
    media:
      row.item_id === null
        ? null
        : (options.mediaByItemId.get(row.item_id) ?? null),
  };
}

/**
 * The one file-DTO reader: these rows as `UploadFileDto`s, media and all, in
 * the order given.
 *
 * The detail's file page composes its files with it, and so do the routes
 * whose response carries a single file (`complete`, `retry`), so the file a
 * route returns and the file the session detail lists cannot drift. Signing
 * is local HMAC work, but it is still a B2 client call: run it after any
 * transaction has closed.
 *
 * @param options.database The Kysely handle.
 * @param options.b2 The Backblaze client, for signing.
 * @param options.fileRows The rows, already resolved for the viewer.
 * @param options.now The request's clock, which `expiresAt` counts from.
 */
export async function readUploadFileDtos(options: {
  database: DatabaseExecutor;
  b2: B2Client;
  fileRows: readonly UploadFileRow[];
  now: Date;
}): Promise<UploadFileDto[]> {
  const mediaByItemId = await _readMediaByItemId(options);
  return options.fileRows.map((row) => {
    return _makeUploadFileDtoFromRow({ row, mediaByItemId });
  });
}

/** The position after which a page starts, or the `400` for a bad cursor. */
function _getAfterPosition(cursor: string | null): number | undefined {
  if (cursor === null) {
    return undefined;
  }
  const position = getPositionFromUploadFileCursor(cursor);
  if (position === undefined) {
    throw ApiError.invalidRequest({
      cursor: ["This is not a cursor this route issued."],
    });
  }
  return position;
}

/**
 * One page of a session's files, in manifest order, with their media.
 *
 * Reads one row past the limit to learn whether there is a next page, so the
 * end of the list is a null `nextCursor` and never an empty extra page.
 *
 * @param options.database The Kysely handle, never a transaction: this signs
 *   URLs, so it runs after any transaction has closed.
 * @param options.b2 The Backblaze client, for signing.
 * @param options.sessionId The session, already resolved for the viewer.
 * @param options.now The request's clock, which `expiresAt` counts from.
 * @param options.page Which page, of which states.
 */
export async function readUploadFilePage(options: {
  database: DatabaseExecutor;
  b2: B2Client;
  sessionId: string;
  now: Date;
  page: Readonly<UploadFilePageRequest>;
}): Promise<UploadFilePage> {
  const rows = await _readFileRows({
    database: options.database,
    filter: {
      sessionId: options.sessionId,
      afterPosition: _getAfterPosition(options.page.cursor),
      states: options.page.states,
      limit: options.page.limit + 1,
    },
  });
  const pageRows = rows.slice(0, options.page.limit);
  const lastRow = pageRows.at(-1);

  return {
    files: await readUploadFileDtos({
      database: options.database,
      b2: options.b2,
      fileRows: pageRows,
      now: options.now,
    }),
    nextCursor:
      rows.length > options.page.limit && lastRow !== undefined
        ? makeUploadFileCursorFromPosition(lastRow.position)
        : null,
  };
}
