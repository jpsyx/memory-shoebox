import {
  mediaPreviewRequestSchema,
  type MediaPreview,
  type MediaPreviewRequest,
  type MediaSource,
} from "@memory-shoebox/shared";
import { appConfig } from "../../../../app.config.ts";
import { makeMediaRefFromSources } from "../archive/makeMediaRefFromSources.ts";
import { readMediaSources } from "../archive/readMediaSources.ts";
import {
  makeSelectionExpressionFromFilter,
  makeTimelineFilterFromQuery,
} from "../archive/selectionFilterHelpers.ts";
import type { B2Client } from "../b2/createB2Client/createB2Client.types.ts";
import type { Selectable } from "kysely";
import type { Database, DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";

type PreviewOptions = {
  database: DatabaseExecutor;
  b2: B2Client;
  viewer: Viewer;
  now: Date;
  request: MediaPreviewRequest;
};

type PreviewRow = Pick<
  Selectable<Database["items"]>,
  "id" | "kind" | "width" | "height" | "duration_ms" | "alt_text"
>;

function _makePreviewFromRow(options: {
  row: Readonly<PreviewRow>;
  sources: ReadonlyMap<string, MediaSource>;
  previewState: "pending" | "unavailable";
}): MediaPreview {
  const { row, sources } = options;
  const kind = row.kind === "video" ? "video" : "photo";
  return {
    itemId: row.id,
    kind,
    width: row.width,
    height: row.height,
    media: makeMediaRefFromSources({
      kind,
      width: row.width,
      height: row.height,
      previewState: options.previewState,
      durationMs: row.duration_ms,
      altText: row.alt_text ?? (kind === "photo" ? "Photo" : "Video"),
      sources,
    }),
  };
}

/** Authorizes each batch before leasing sources; never latches seen or open. */
export async function readMediaPreviews(
  options: Readonly<PreviewOptions>,
): Promise<MediaPreview[]> {
  const request = mediaPreviewRequestSchema.parse(options.request);
  const rows = await options.database
    .selectFrom("items")
    .select(["id", "kind", "width", "height", "duration_ms", "alt_text"])
    .where("id", "in", request.itemIds)
    .where(
      makeSelectionExpressionFromFilter({
        viewer: options.viewer,
        filter: makeTimelineFilterFromQuery({}),
      }),
    )
    .execute();
  const sources = await readMediaSources({
    ...options,
    purposesByItemId: new Map(
      rows.map((row) => {
        return [row.id, request.purpose];
      }),
    ),
    ttlSeconds: appConfig.media.signedUrlTtlSeconds,
  });
  const previews = new Map(
    rows.map((row) => {
      return [
        row.id,
        _makePreviewFromRow({
          row,
          sources: sources.sourcesByItemId.get(row.id) ?? new Map(),
          previewState:
            sources.previewStatesByItemId.get(row.id) ?? "unavailable",
        }),
      ];
    }),
  );
  return request.itemIds.flatMap((id) => {
    const preview = previews.get(id);
    return preview === undefined ? [] : [preview];
  });
}
