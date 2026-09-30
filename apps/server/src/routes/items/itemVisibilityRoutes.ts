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
import { ApiError } from "../../http/ApiError.ts";
import { requireViewer } from "../../http/requestContextHelpers.ts";
import { getVisibleItemOr404 } from "../../items/getVisibleItemOr404.ts";
import {
  assertMayChangeItemAccess,
  assertMayEditItemContent,
  mayChangeItemAccess,
} from "../../items/itemPermissions.ts";
import { readItemDetail } from "../../items/readItemDetail/readItemDetail.ts";
import { readItemSummariesByIds } from "../../items/readItemSummariesByIds/readItemSummariesByIds.ts";
import { applyVisibilityFilter } from "../../visibility/applyVisibilityFilter.ts";

/**
 * `PATCH /items/:itemId/visibility`: repoint one item at a rule.
 *
 * Repoints the item at a rule `POST /api/visibility-rules/resolve` already
 * found or created; this route never touches `visibility_rules` itself.
 * Both guards run: the role gate (`item_visibility_forbidden` for a
 * viewer), then ownership, since changing who can see something is the
 * access-changing action and belongs to the item's own uploader or an
 * admin (`items.md` Ruling 1), not to any uploader.
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
  assertMayEditItemContent({ viewer, code: "item_visibility_forbidden" });
  assertMayChangeItemAccess({
    viewer,
    uploadedBy: item.uploadedBy,
    code: "item_visibility_forbidden",
  });

  const rule = await request.server.database
    .selectFrom("visibility_rules")
    .select("visibility_rules.id as ruleId")
    .where("visibility_rules.id", "=", body.visibilityRuleId)
    .executeTakeFirst();
  if (rule === undefined) {
    throw ApiError.invalidRequest({
      visibilityRuleId: ["That is not a rule in this Shoebox."],
    });
  }

  if (body.visibilityRuleId !== item.visibilityRuleId) {
    await runInImmediateTransaction({
      database: request.server.database,
      callback: async (transaction) => {
        // One column. The old rule is left exactly as it was, still
        // covering every other item pointing at it.
        await transaction
          .updateTable("items")
          .set({ visibility_rule_id: body.visibilityRuleId })
          .where("id", "=", item.itemId)
          .execute();

        // Visibility is one of the three things the state tables cannot
        // answer later, because only the current value survives.
        await writeActivityEvent({
          transaction,
          viewer,
          kind: "item_visibility_changed",
          subjectKind: "item",
          subjectId: item.itemId,
          subjectLabel: `A photograph from ${item.capturedOn}`,
          detail: {
            previousVisibilityRuleId: item.visibilityRuleId,
            visibilityRuleId: body.visibilityRuleId,
          },
          now: now.toISOString(),
        });
      },
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

  assertMayEditItemContent({ viewer, code: "item_visibility_forbidden" });

  const rows = await applyVisibilityFilter({
    viewer,
    query: request.server.database
      .selectFrom("items")
      .select([
        "items.id as itemId",
        "items.uploaded_by as uploadedBy",
        "items.visibility_rule_id as visibilityRuleId",
        "items.captured_on as capturedOn",
      ])
      .where("items.id", "in", [...body.itemIds]),
  }).execute();

  if (rows.length !== body.itemIds.length) {
    throw ApiError.notFound("item_not_found");
  }

  const rule = await request.server.database
    .selectFrom("visibility_rules")
    .select("visibility_rules.id as ruleId")
    .where("visibility_rules.id", "=", body.visibilityRuleId)
    .executeTakeFirst();
  if (rule === undefined) {
    throw ApiError.invalidRequest({
      visibilityRuleId: ["That is not a rule in this Shoebox."],
    });
  }

  // Per item, and only here: the role gate above already ran once.
  const mine = rows.filter((row) => {
    return mayChangeItemAccess({ viewer, uploadedBy: row.uploadedBy });
  });
  const skippedCount = rows.length - mine.length;

  const moved = mine.filter((row) => {
    return row.visibilityRuleId !== body.visibilityRuleId;
  });

  if (moved.length > 0) {
    await runInImmediateTransaction({
      database: request.server.database,
      callback: async (transaction) => {
        await transaction
          .updateTable("items")
          .set({ visibility_rule_id: body.visibilityRuleId })
          .where(
            "id",
            "in",
            moved.map((row) => {
              return row.itemId;
            }),
          )
          .execute();

        // One row per item, never one for the batch: the log is read by
        // subject id, and a batch row answers no question anybody asks
        // of it.
        await Promise.all(
          moved.map((row) => {
            return writeActivityEvent({
              transaction,
              viewer,
              kind: "item_visibility_changed",
              subjectKind: "item",
              subjectId: row.itemId,
              subjectLabel: `A photograph from ${row.capturedOn}`,
              detail: {
                previousVisibilityRuleId: row.visibilityRuleId,
                visibilityRuleId: body.visibilityRuleId,
              },
              now: now.toISOString(),
            });
          }),
        );
      },
    });
  }

  return {
    items: await readItemSummariesByIds({
      database: request.server.database,
      b2: request.server.b2,
      viewer,
      itemIds: body.itemIds,
      now,
      logger: request.log,
    }),
    skippedCount,
    // Structurally present and always null: the response set is bounded
    // by the request, so there is nothing to page.
    nextCursor: null,
  };
}
