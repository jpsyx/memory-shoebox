import {
  renditionPurposeSchema,
  type MediaReadPurpose,
  type MediaSource,
} from "@memory-shoebox/shared";
import type { B2Client } from "../b2/createB2Client/createB2Client.types.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import {
  getRenditionsFromReadPurpose,
  type RenditionRow,
} from "../media/getRenditionsFromReadPurpose.ts";

type ReadMediaSourcesOptions = {
  database: DatabaseExecutor;
  b2: B2Client;
  purposesByItemId: ReadonlyMap<string, MediaReadPurpose>;
  now: Date;
  ttlSeconds: number;
};

type ItemRenditionRow = RenditionRow & {
  itemId: string;
  kind: "photo" | "video";
};

/** Obtains the actual viewing lease for one already-selected rendition. */
async function _getSourceFromRendition(options: {
  row: Readonly<RenditionRow>;
  readOptions: Readonly<ReadMediaSourcesOptions>;
}): Promise<MediaSource> {
  const { row, readOptions } = options;
  const lease = await readOptions.b2.getMediaLease({
    key: row.storageKey,
    renditionId: row.renditionId,
    now: readOptions.now,
    expiresInSeconds: readOptions.ttlSeconds,
  });
  return {
    ...lease,
    renditionId: row.renditionId,
    purpose: row.purpose,
    contentType: row.contentType,
    byteSize: row.byteSize,
    width: row.width,
    height: row.height,
  };
}

/** Signs only selected representations and preserves their actual lease metadata. */
async function _getSourcesFromRows(options: {
  rows: readonly ItemRenditionRow[];
  readOptions: Readonly<ReadMediaSourcesOptions>;
}): Promise<Map<string, Map<string, MediaSource>>> {
  const byItemId = new Map<string, ItemRenditionRow[]>();
  options.rows.forEach((row) => {
    const itemRows = byItemId.get(row.itemId) ?? [];
    itemRows.push(row);
    byItemId.set(row.itemId, itemRows);
  });
  const sourcesByItemId = new Map<string, Map<string, MediaSource>>();
  await Promise.all(
    [...byItemId].map(async ([itemId, rows]) => {
      const purpose = options.readOptions.purposesByItemId.get(itemId);
      if (purpose === undefined) return;
      const firstRow = rows[0];
      if (firstRow === undefined) return;
      const selected = getRenditionsFromReadPurpose({
        rows,
        kind: firstRow.kind,
        purpose,
      });
      const sources = await Promise.all(
        selected.map(async (row) => {
          const source = await _getSourceFromRendition({
            row,
            readOptions: options.readOptions,
          });
          return [row.purpose, source] as const;
        }),
      );
      sourcesByItemId.set(itemId, new Map(sources));
    }),
  );
  return sourcesByItemId;
}

/**
 * Reads catalog identity, oriented dimensions, MIME and bytes in one batched
 * query after visibility checks. Purpose eligibility is decided before signing;
 * only a selected video receives an original playback fallback.
 */
export async function readMediaSources(
  options: Readonly<ReadMediaSourcesOptions>,
): Promise<Map<string, Map<string, MediaSource>>> {
  if (options.purposesByItemId.size === 0) return new Map();
  const rows = await options.database
    .selectFrom("item_renditions")
    .innerJoin("items", "items.id", "item_renditions.item_id")
    .select([
      "item_renditions.item_id as itemId",
      "items.kind as kind",
      "item_renditions.id as renditionId",
      "item_renditions.purpose as purpose",
      "item_renditions.storage_key as storageKey",
      "item_renditions.content_type as contentType",
      "item_renditions.byte_size as byteSize",
      "item_renditions.width as width",
      "item_renditions.height as height",
    ])
    .where("item_renditions.item_id", "in", [
      ...options.purposesByItemId.keys(),
    ])
    .execute();
  const validRows = rows.flatMap((row) => {
    const purpose = renditionPurposeSchema.safeParse(row.purpose);
    return purpose.success
      ? [
          {
            ...row,
            purpose: purpose.data,
            kind:
              row.kind === "video" ? ("video" as const) : ("photo" as const),
          },
        ]
      : [];
  });
  return _getSourcesFromRows({ rows: validRows, readOptions: options });
}
