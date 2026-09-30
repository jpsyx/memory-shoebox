import { CAPTURE_SOURCES, type ItemsErrorCode } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { ApiError } from "../http/ApiError.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { applyVisibilityFilter } from "../visibility/applyVisibilityFilter.ts";

/**
 * One item, with every column the routes in this slice read from it.
 *
 * Wider than any single caller needs, and deliberately so: it is read once per
 * request and handed to whichever guard, composer or transaction the route
 * runs, so no handler goes back to `items` for a column it forgot.
 */
export type VisibleItem = {
  itemId: string;
  kind: "photo" | "video";
  capturedAt: string;
  capturedOn: string;
  capturedAtOffsetMinutes: number | null;
  captureSource: (typeof CAPTURE_SOURCES)[number];
  originalCapturedAt: string;
  uploadedBy: string;
  visibilityRuleId: string;
  burstId: string | null;
  burstIndex: number | null;
  durationMs: number | null;
  /** `items.alt_text`: an override, written only when somebody typed one. */
  altTextOverride: string | null;
  originalFilename: string | null;
};

/**
 * Resolves one item under the viewer's predicate, or refuses the request.
 *
 * **Every handler in this slice starts here, and nothing checks a role before
 * it has.** Resolving visibility before role is what keeps a `403` from being
 * an existence oracle: a 404 means you may not see it, a 403 means you can see
 * it and may not do it (`conventions.md` § Errors). Reversing the two turns
 * every forbidden action into a test for whether an id exists, which is
 * exactly what the counting rule exists to prevent.
 *
 * The 404 is byte-identical for an invisible item and for an id that never
 * existed, because it is the same `ApiError` either way: there is no branch
 * here that could make them differ.
 *
 * @param options.database The Kysely handle, or a transaction.
 * @param options.viewer The request's viewer.
 * @param options.itemId The item addressed.
 * @param options.code The resource the caller addressed. `item_not_found`
 *   unless the route took a comment id, where the code names the comment.
 */
export async function getVisibleItemOr404(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  itemId: string;
  code?: ItemsErrorCode;
}): Promise<VisibleItem> {
  const row = await applyVisibilityFilter({
    viewer: options.viewer,
    query: options.database
      .selectFrom("items")
      .select([
        "items.id as itemId",
        "items.kind as kind",
        "items.captured_at as capturedAt",
        "items.captured_on as capturedOn",
        "items.captured_at_offset_minutes as capturedAtOffsetMinutes",
        "items.capture_source as captureSource",
        "items.original_captured_at as originalCapturedAt",
        "items.uploaded_by as uploadedBy",
        "items.visibility_rule_id as visibilityRuleId",
        "items.burst_id as burstId",
        "items.burst_index as burstIndex",
        "items.duration_ms as durationMs",
        "items.alt_text as altTextOverride",
        "items.original_filename as originalFilename",
      ])
      .where("items.id", "=", options.itemId),
  }).executeTakeFirst();

  if (row === undefined) {
    throw ApiError.notFound(options.code ?? "item_not_found");
  }

  return {
    ...row,
    // The column is `CHECK IN ('photo','video')`, so this cannot see a third.
    kind: row.kind === "video" ? "video" : "photo",
    // `capture_source` carries a closed `CHECK` over exactly the six values
    // `CAPTURE_SOURCES` lists, so this cannot see a seventh. Narrowed here
    // rather than wherever the payload is composed, so every reader of a
    // `VisibleItem` gets the literal union instead of a bare string.
    captureSource:
      CAPTURE_SOURCES.find((source) => {
        return source === row.captureSource;
      }) ?? "upload_time",
  };
}
