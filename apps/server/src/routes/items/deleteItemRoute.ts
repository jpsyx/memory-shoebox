import type { FastifyReply, FastifyRequest } from "fastify";
import { itemIdParamsSchema } from "@memory-shoebox/shared";
import { runInImmediateTransaction } from "../../db/runInImmediateTransaction.ts";
import { requireViewer } from "../../http/requestContextHelpers.ts";
// Aliased so the handler below can carry the route's own name: `deleteItem`
// there is the HTTP verb, and this is the cascade it runs.
import { deleteItem as deleteItemRecord } from "../../items/deleteItem/deleteItem.ts";
import { getVisibleItemOr404 } from "../../items/getVisibleItemOr404.ts";
import {
  assertMayChangeItemAccess,
  assertMayEditItemContent,
} from "../../items/itemPermissionHelpers/itemPermissionHelpers.ts";

/**
 * `DELETE /items/:itemId`: destroy the record and enqueue the objects.
 *
 * **Nothing blocks**, so there is no `409` in this route's table: not an
 * open removal request, because deleting is how you grant one, and not a
 * burst with forty-four siblings, because deleting one frame of forty-five
 * is ordinary. The whole cascade, the object enqueue and the audit row are
 * one transaction; `deleteItem` owns the order they have to run in.
 *
 * The item is resolved before the transaction opens, and nothing between
 * that read and the delete can make the row disagree with it: SQLite takes
 * a single writer and `BEGIN IMMEDIATE` holds it for the whole transaction,
 * so a concurrent edit either landed before the read or waits behind this
 * delete and then finds nothing to change.
 */
export async function deleteItem(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const viewer = requireViewer(request);
  const { itemId } = itemIdParamsSchema.parse(request.params);

  const item = await getVisibleItemOr404({
    database: request.server.database,
    viewer,
    itemId,
  });
  // Both guards, in this order, exactly as the visibility routes do it.
  // `conventions.md` § Who may change an item is binding and ends "a
  // viewer may do none of it", so a member demoted to viewer stops being
  // able to destroy even their own photographs; ownership is the second
  // half, not a way round the first.
  assertMayEditItemContent({ viewer, code: "item_delete_forbidden" });
  assertMayChangeItemAccess({
    viewer,
    uploadedBy: item.uploadedBy,
    code: "item_delete_forbidden",
  });

  await runInImmediateTransaction({
    database: request.server.database,
    callback: (transaction) => {
      return deleteItemRecord({
        transaction,
        viewer,
        item,
        now: request.server.clock().toISOString(),
      });
    },
  });

  // 204, no body. There is nothing to return: the resource is gone, and
  // there is no soft-deleted shadow of it to describe.
  return reply.code(204).send();
}
