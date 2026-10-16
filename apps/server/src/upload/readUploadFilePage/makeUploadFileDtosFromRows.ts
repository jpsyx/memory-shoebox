import { readUploadBurstGroups } from "../readUploadBurstGroups.ts";
import type { MediaRef, UploadFileDto } from "@memory-shoebox/shared";

import { APP_CONFIG } from "../../../../../app.config.ts";

import { itemAltText } from "../../archive/makeAltTextFromItem.ts";

import { makeMediaRefFromSources } from "../../archive/makeMediaRefFromSources.ts";

import { readMediaSources } from "../../archive/readMediaSources.ts";

import { readPeopleNamesByItemId } from "../../archive/readPeopleNamesByItemId.ts";

import type { DatabaseExecutor } from "../../db/types/db.types.ts";

import { readInstanceSettings } from "../../settings/readInstanceSettings.ts";

import type { UploadFileRow } from "../uploadSessionAccessHelpers.ts";

import {
  getCaptureSourceFromStoredValue,
  getUploadFileStateFromStoredValue,
  getUploadProblemCodeFromStoredValue,
} from "../uploadStateHelpers.ts";

import type {
  ItemMediaRow,
  ReadMediaLookupsOptions,
  MediaLookups,
  ReadMediaByItemIdOptions,
  ReadUploadFileDtosOptions,
} from "./readUploadFilePage.types.ts";

/** The items the rows became, in one query keyed by their ids. */
async function _readItemMediaRows(options: {
  database: DatabaseExecutor;
  itemIds: readonly string[];
}): Promise<Map<string, ItemMediaRow>> {
  const rows = await options.database
    .selectFrom("items")
    .select([
      "items.id as itemId",
      "items.kind as kind",
      "items.width as width",
      "items.height as height",
      "items.captured_at as capturedAt",
      "items.duration_ms as durationMs",
      "items.alt_text as altText",
    ])
    .where("items.id", "in", [...options.itemIds])
    .execute();
  return new Map(
    rows.map((row) => {
      return [
        row.itemId,
        {
          ...row,
          durationMs: row.durationMs ?? undefined,
          altText: row.altText ?? undefined,
        },
      ] as const;
    }),
  );
}

/**
 * Returns item media, signed sources, people names, and the timezone needed to
 * compose file media and alt text.
 */
async function _readMediaLookups(
  options: Readonly<Omit<ReadMediaLookupsOptions, "itemIds">> &
    Readonly<{ itemIds: readonly string[] }>,
): Promise<MediaLookups> {
  // **One batched renditions query for all the rows**, keyed by their item
  // ids, never a join per file (`data-models.md` § `item_renditions`), and the
  // signed URLs are minted in that one pass. The items, the people names and
  // the zone are the other reads the composed alt text needs.

  const [items, sources, peopleNames, settings] = await Promise.all([
    _readItemMediaRows(options),
    readMediaSources({
      database: options.database,
      b2: options.b2,
      purposesByItemId: new Map(
        options.itemIds.map((itemId) => {
          return [itemId, "thumbnail"];
        }),
      ),
      now: options.now,
      ttlSeconds: APP_CONFIG.media.signedUrlTtlSeconds,
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

/** One landed item's representations, retaining unavailable previews. */
function _makeMediaRefFromItem(options: {
  item: Readonly<ItemMediaRow>;
  lookups: Omit<MediaLookups, "items" | "sources" | "peopleNames"> & {
    items: ReadonlyMap<string, ItemMediaRow>;
    sources: MediaLookups["sources"];
    peopleNames: ReadonlyMap<string, string[]>;
  };
}): MediaRef {
  const { item, lookups } = options;
  return makeMediaRefFromSources({
    kind: item.kind === "video" ? "video" : "photo",
    width: item.width,
    height: item.height,
    previewState:
      lookups.sources.previewStatesByItemId.get(item.itemId) ?? "unavailable",
    sources: lookups.sources.sourcesByItemId.get(item.itemId) ?? new Map(),
    durationMs: item.durationMs ?? undefined,
    altText: itemAltText({
      altTextOverride: item.altText ?? null,
      personNames: lookups.peopleNames.get(item.itemId) ?? [],
      capturedAt: item.capturedAt,
      timezone: lookups.timezone,
    }),
  });
}

/** Every `MediaRef` the rows' items are drawn with, by item id. */
async function _readMediaByItemId(
  options: Readonly<Omit<ReadMediaByItemIdOptions, "fileRows">> &
    Readonly<{ fileRows: readonly UploadFileRow[] }>,
): Promise<Map<string, MediaRef>> {
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
    problemCode:
      getUploadProblemCodeFromStoredValue(row.problem_code ?? undefined) ??
      null,
    problemDetail: row.problem_detail,
    duplicateReason: row.duplicate_reason,
    capturedAt: row.captured_at,
    capturedOn: row.capture_date,
    captureOffsetMinutes: row.capture_offset_minutes,
    captureSource:
      getCaptureSourceFromStoredValue(row.capture_source ?? undefined) ?? null,
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
export async function makeUploadFileDtosFromRows(
  options: Readonly<Omit<ReadUploadFileDtosOptions, "fileRows">> &
    Readonly<{ fileRows: readonly UploadFileRow[] }>,
): Promise<UploadFileDto[]> {
  const [mediaByItemId, groupMaps] = await Promise.all([
    _readMediaByItemId(options),
    Promise.all(
      [
        ...new Set(
          options.fileRows.map((row) => {
            return row.upload_session_id;
          }),
        ),
      ].map((sessionId) => {
        return readUploadBurstGroups({ database: options.database, sessionId });
      }),
    ),
  ]);
  const burstGroups = new Map(
    groupMaps.flatMap((groups) => {
      return [...groups];
    }),
  );
  return options.fileRows.map((row) => {
    return {
      ..._makeUploadFileDtoFromRow({ row, mediaByItemId }),
      burst: burstGroups.get(row.id) ?? null,
    };
  });
}
