import type { FastifyRequest } from "fastify";
import {
  itemIdParamsSchema,
  setItemsVisibilityRequestSchema,
  setItemVisibilityRequestSchema,
  type ItemDetail,
  type SetItemsVisibilityResponse,
} from "@memory-shoebox/shared";
import { writeActivityEvent } from "../../activity/writeActivityEvent.ts";
import { runInImmediateTransaction } from "../../db/runInImmediateTransaction.ts";
import type { DatabaseExecutor } from "../../db/types/db.types.ts";
import { ApiError } from "../../http/ApiError.ts";
import {
  requireViewer,
  type Viewer,
} from "../../http/requestContextHelpers.ts";
import {
  getVisibleItemOr404,
  type VisibleItem,
} from "../../items/getVisibleItemOr404.ts";
import {
  assertMayChangeItemAccess,
  assertMayEditItemContent,
  mayChangeItemAccess,
} from "../../items/itemPermissions.ts";
import { readItemDetail } from "../../items/readItemDetail/readItemDetail.ts";
import { readItemSummariesByIds } from "../../items/readItemSummariesByIds/readItemSummariesByIds.ts";
import { applyVisibilityFilter } from "../../visibility/applyVisibilityFilter.ts";

/** One item of a selection, as the batch route resolved it. */
type SelectedItemRow = {
  itemId: string;
  uploadedBy: string;
  visibilityRuleId: string;
  capturedOn: string;
};

/**
 * Refuses a rule id that names nothing in this Shoebox.
 *
 * A 400 rather than a 404: the addressed resource is the item, which the
 * caller has already been shown to be able to see, and the rule id is a
 * field of the body.
 */
async function _assertRuleExists(options: {
  database: DatabaseExecutor;
  visibilityRuleId: string;
}): Promise<void> {
  const rule = await options.database
    .selectFrom("visibility_rules")
    .select("visibility_rules.id as ruleId")
    .where("visibility_rules.id", "=", options.visibilityRuleId)
    .executeTakeFirst();
  if (rule === undefined) {
    throw ApiError.invalidRequest({
      visibilityRuleId: ["That is not a rule in this Shoebox."],
    });
  }
}

/**
 * The two guards the single-item route runs, in the order they must run in.
 *
 * The role gate first (`item_visibility_forbidden` for a viewer), then
 * ownership, since changing who can see something is the access-changing
 * action and belongs to the item's own uploader or an admin (`items.md`
 * Ruling 1), not to any uploader.
 */
function _assertMaySetItemVisibility(options: {
  viewer: Viewer;
  uploadedBy: string;
}): void {
  assertMayEditItemContent({
    viewer: options.viewer,
    code: "item_visibility_forbidden",
  });
  assertMayChangeItemAccess({
    viewer: options.viewer,
    uploadedBy: options.uploadedBy,
    code: "item_visibility_forbidden",
  });
}

/**
 * One item's column, and the one log row that records the move.
 *
 * The old rule is left exactly as it was, still covering every other item
 * pointing at it. Visibility is one of the three things the state tables
 * cannot answer later, because only the current value survives.
 */
async function _repointItemAtRule(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  item: VisibleItem;
  visibilityRuleId: string;
  now: Date;
}): Promise<void> {
  const { item } = options;
  await runInImmediateTransaction({
    database: options.database,
    callback: async (transaction) => {
      await transaction
        .updateTable("items")
        .set({ visibility_rule_id: options.visibilityRuleId })
        .where("id", "=", item.itemId)
        .execute();

      await writeActivityEvent({
        transaction,
        viewer: options.viewer,
        kind: "item_visibility_changed",
        subjectKind: "item",
        subjectId: item.itemId,
        subjectLabel: `A photograph from ${item.capturedOn}`,
        detail: {
          previousVisibilityRuleId: item.visibilityRuleId,
          visibilityRuleId: options.visibilityRuleId,
        },
        now: options.now.toISOString(),
      });
    },
  });
}

/**
 * `PATCH /items/:itemId/visibility`: repoint one item at a rule.
 *
 * Repoints the item at a rule `POST /api/visibility-rules/resolve` already
 * found or created; this route never touches `visibility_rules` itself.
 * Both guards run, in the order `_assertMaySetItemVisibility` fixes.
 */
export async function patchItemVisibility(
  request: FastifyRequest,
): Promise<ItemDetail> {
  const viewer = requireViewer(request);
  const { itemId } = itemIdParamsSchema.parse(request.params);
  const body = setItemVisibilityRequestSchema.parse(request.body);
  const now = request.server.clock();

  const item = await getVisibleItemOr404({
    database: request.server.database,
    viewer,
    itemId,
  });
  _assertMaySetItemVisibility({ viewer, uploadedBy: item.uploadedBy });
  await _assertRuleExists({
    database: request.server.database,
    visibilityRuleId: body.visibilityRuleId,
  });

  if (body.visibilityRuleId !== item.visibilityRuleId) {
    await _repointItemAtRule({
      database: request.server.database,
      viewer,
      item,
      visibilityRuleId: body.visibilityRuleId,
      now,
    });
  }

  // The change is retroactive by construction: groups expand at read
  // time, so nothing is snapshotted and nothing needs recomputing. The
  // generation is deliberately not bumped: repointing an item changes no
  // rule's subjects and no member's role.
  return readItemDetail({
    database: request.server.database,
    b2: request.server.b2,
    viewer,
    item: { ...item, visibilityRuleId: body.visibilityRuleId },
    now,
  });
}

/**
 * Every id in the selection, resolved under the viewer's predicate, or a 404.
 *
 * **All or nothing, and nothing may look at ownership before it has run.**
 * One id the viewer cannot see fails the whole request with the standard
 * `404` and no `details` naming which id failed, because a list of the ids
 * that survived is a count of what the viewer cannot see.
 */
async function _readSelectionOr404(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  itemIds: readonly string[];
}): Promise<SelectedItemRow[]> {
  const rows = await applyVisibilityFilter({
    viewer: options.viewer,
    query: options.database
      .selectFrom("items")
      .select([
        "items.id as itemId",
        "items.uploaded_by as uploadedBy",
        "items.visibility_rule_id as visibilityRuleId",
        "items.captured_on as capturedOn",
      ])
      .where("items.id", "in", [...options.itemIds]),
  }).execute();

  if (rows.length !== options.itemIds.length) {
    throw ApiError.notFound("item_not_found");
  }
  return rows;
}

/**
 * The rows of the selection this caller may actually change.
 *
 * **Per item, and the last question asked.** It takes rows rather than ids
 * precisely so it cannot run before `_readSelectionOr404` has: an id the
 * viewer cannot see has already failed the whole request by the time there
 * is a row here to hand it. The role gate is not repeated, having run once
 * for the request.
 */
function _getOwnedRows(options: {
  viewer: Viewer;
  rows: readonly SelectedItemRow[];
}): SelectedItemRow[] {
  return options.rows.filter((row) => {
    return mayChangeItemAccess({
      viewer: options.viewer,
      uploadedBy: row.uploadedBy,
    });
  });
}

/**
 * One log row per item that moved, never one for the batch: the log is read
 * by subject id, and a batch row answers no question anybody asks of it.
 */
async function _writeSelectionActivityEvents(options: {
  transaction: DatabaseExecutor;
  viewer: Viewer;
  rows: readonly SelectedItemRow[];
  visibilityRuleId: string;
  now: Date;
}): Promise<void> {
  await Promise.all(
    options.rows.map((row) => {
      return writeActivityEvent({
        transaction: options.transaction,
        viewer: options.viewer,
        kind: "item_visibility_changed",
        subjectKind: "item",
        subjectId: row.itemId,
        subjectLabel: `A photograph from ${row.capturedOn}`,
        detail: {
          previousVisibilityRuleId: row.visibilityRuleId,
          visibilityRuleId: options.visibilityRuleId,
        },
        now: options.now.toISOString(),
      });
    }),
  );
}

/**
 * The selection's columns, and the log rows beside them, in one transaction.
 *
 * An item already pointing at the rule is left out of both statements, so a
 * save that changes nothing writes nothing and logs nothing.
 */
async function _repointRowsAtRule(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  rows: readonly SelectedItemRow[];
  visibilityRuleId: string;
  now: Date;
}): Promise<void> {
  const moved = options.rows.filter((row) => {
    return row.visibilityRuleId !== options.visibilityRuleId;
  });
  if (moved.length === 0) {
    return;
  }

  await runInImmediateTransaction({
    database: options.database,
    callback: async (transaction) => {
      await transaction
        .updateTable("items")
        .set({ visibility_rule_id: options.visibilityRuleId })
        .where(
          "id",
          "in",
          moved.map((row) => {
            return row.itemId;
          }),
        )
        .execute();

      await _writeSelectionActivityEvents({
        transaction,
        viewer: options.viewer,
        rows: moved,
        visibilityRuleId: options.visibilityRuleId,
        now: options.now,
      });
    },
  });
}

/**
 * `POST /items/visibility`: a selection's save.
 *
 * The two ways an id can fail here are different failure modes, and
 * `items.md` answers them differently.
 *
 * **An id the viewer cannot see** is a visibility miss, and it is all or
 * nothing: resolve every id under the predicate first, and one miss fails
 * the whole request with the standard `404` and no `details` naming which
 * id failed, because a list of the ids that survived is a count of what
 * the viewer cannot see.
 *
 * **An id the viewer can see and does not own** is an ownership skip, and
 * it is per item: "a selection spanning two uploaders changes only the
 * caller's own, and the response says how many it skipped rather than
 * failing the whole call". `skippedCount` is not the per-id oracle
 * transformation 1 rejected, because the caller already holds `uploadedBy`
 * on every `ItemSummary` in the response and on every print in the
 * timeline they built the selection from.
 *
 * The role is still checked once for the request, not per item, so a
 * `viewer` meets the 403 before any of this.
 */
export async function postItemsVisibility(
  request: FastifyRequest,
): Promise<SetItemsVisibilityResponse> {
  const viewer = requireViewer(request);
  const body = setItemsVisibilityRequestSchema.parse(request.body);
  const now = request.server.clock();

  // **The order of these three is the contract, not a style.** The role gate
  // once for the request, then every id resolved under the predicate, then
  // ownership per item, which is why `_getOwnedRows` takes resolved rows.
  assertMayEditItemContent({ viewer, code: "item_visibility_forbidden" });
  const rows = await _readSelectionOr404({
    database: request.server.database,
    viewer,
    itemIds: body.itemIds,
  });
  await _assertRuleExists({
    database: request.server.database,
    visibilityRuleId: body.visibilityRuleId,
  });
  const mine = _getOwnedRows({ viewer, rows });

  await _repointRowsAtRule({
    database: request.server.database,
    viewer,
    rows: mine,
    visibilityRuleId: body.visibilityRuleId,
    now,
  });

  return {
    items: await readItemSummariesByIds({
      database: request.server.database,
      b2: request.server.b2,
      viewer,
      itemIds: body.itemIds,
      now,
      logger: request.log,
    }),
    skippedCount: rows.length - mine.length,
    // Structurally present and always null: the response set is bounded
    // by the request, so there is nothing to page.
    nextCursor: null,
  };
}
