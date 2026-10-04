import type { FastifyRequest } from "fastify";
import {
  itemIdParamsSchema,
  setItemPeopleRequestSchema,
  setItemTagsRequestSchema,
  updateItemRequestSchema,
  type ItemDetail,
} from "@memory-shoebox/shared";
import { runInImmediateTransaction } from "../../db/runInImmediateTransaction.ts";
import { requireViewer } from "../../http/requestContextHelpers.ts";
import { getVisibleItemOr404 } from "../../items/getVisibleItemOr404.ts";
import { assertMayEditItemContent } from "../../items/itemPermissionHelpers/itemPermissionHelpers.ts";
import { readItemDetail } from "../../items/readItemDetail/readItemDetail.ts";
import { setItemPeople } from "../../items/setItemPeople.ts";
import { setItemTags } from "../../items/setItemTags/setItemTags.ts";

// The three edits gated by the role alone, with no ownership qualifier: any
// uploader or admin may describe, tag and people-tag anybody's photograph,
// which is the additive half of `conventions.md` § Who may change an item.

/**
 * `PATCH /items/:itemId`: the alt text override, and nothing else.
 *
 * Widening this body is how the rest of the contract gets bypassed
 * (`itemEdits.ts`).
 */
export async function patchItem(request: FastifyRequest): Promise<ItemDetail> {
  const viewer = requireViewer(request);
  const { itemId } = itemIdParamsSchema.parse(request.params);
  const body = updateItemRequestSchema.parse(request.body);

  const item = await getVisibleItemOr404({
    database: request.server.database,
    viewer,
    itemId,
  });
  assertMayEditItemContent({ viewer, code: "item_edit_forbidden" });

  // Trimmed by the schema; an empty result clears the override rather
  // than storing a blank description.
  const altText =
    body.altText === null || body.altText === "" ? null : body.altText;

  await request.server.database
    .updateTable("items")
    .set({ alt_text: altText })
    .where("id", "=", item.itemId)
    .execute();

  // The response recomposes `media.altText`, so clearing the override
  // immediately returns the generated string and the surface's own copy
  // stays true.
  return readItemDetail({
    database: request.server.database,
    b2: request.server.b2,
    viewer,
    item: { ...item, altTextOverride: altText },
    now: request.server.clock(),
  });
}

/**
 * `PUT /items/:itemId/tags`: the final set, which is what the chip row
 * expresses.
 *
 * Add or remove chips and press nothing. The write is a diff (`setItemTags`),
 * never a delete and reinsert, which would rewrite the provenance of tags
 * nobody touched.
 */
export async function putItemTags(
  request: FastifyRequest,
): Promise<ItemDetail> {
  const viewer = requireViewer(request);
  const { itemId } = itemIdParamsSchema.parse(request.params);
  const body = setItemTagsRequestSchema.parse(request.body);
  const now = request.server.clock();

  const item = await getVisibleItemOr404({
    database: request.server.database,
    viewer,
    itemId,
  });
  assertMayEditItemContent({ viewer, code: "item_edit_forbidden" });

  await runInImmediateTransaction({
    database: request.server.database,
    callback: async (transaction) => {
      await setItemTags({
        transaction,
        itemId: item.itemId,
        memberId: viewer.memberId,
        names: body.tags,
        now: now.toISOString(),
      });
    },
  });

  return readItemDetail({
    database: request.server.database,
    b2: request.server.b2,
    viewer,
    item,
    now,
  });
}

/**
 * `PUT /items/:itemId/people`: as for tags, with the response's
 * `media.altText` recomposed in the same round trip.
 *
 * The people just changed are half of what composes it, and a people tag
 * grants nothing the tagged person could not already see.
 */
export async function putItemPeople(
  request: FastifyRequest,
): Promise<ItemDetail> {
  const viewer = requireViewer(request);
  const { itemId } = itemIdParamsSchema.parse(request.params);
  const body = setItemPeopleRequestSchema.parse(request.body);
  const now = request.server.clock();

  const item = await getVisibleItemOr404({
    database: request.server.database,
    viewer,
    itemId,
  });
  assertMayEditItemContent({ viewer, code: "item_edit_forbidden" });

  await runInImmediateTransaction({
    database: request.server.database,
    callback: async (transaction) => {
      await setItemPeople({
        transaction,
        itemId: item.itemId,
        memberId: viewer.memberId,
        people: body.people,
        now: now.toISOString(),
      });
    },
  });

  return readItemDetail({
    database: request.server.database,
    b2: request.server.b2,
    viewer,
    item,
    now,
  });
}
