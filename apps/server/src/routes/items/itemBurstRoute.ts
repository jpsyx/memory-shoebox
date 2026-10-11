import type { FastifyRequest } from "fastify";
import {
  itemIdParamsSchema,
  setItemBurstRequestSchema,
  type ItemDetail,
} from "@memory-shoebox/shared";
import { runInImmediateTransaction } from "../../db/runInImmediateTransaction.ts";
import { requireViewer } from "../../http/requestContextHelpers.ts";
import { setItemBurst } from "../../items/setItemBurst.ts";
import { readItemDetail } from "../../items/readItemDetail/readItemDetail.ts";

/** Removes or restores original grouping without touching the photo's media. */
export async function patchItemBurst(
  request: FastifyRequest,
): Promise<ItemDetail> {
  const viewer = requireViewer(request);
  const { itemId } = itemIdParamsSchema.parse(request.params);
  const { action } = setItemBurstRequestSchema.parse(request.body);
  const item = await runInImmediateTransaction({
    database: request.server.database,
    callback: (database) => {
      return setItemBurst({ database, viewer, itemId, action });
    },
  });
  return readItemDetail({
    database: request.server.database,
    b2: request.server.b2,
    viewer,
    item,
    now: request.server.clock(),
  });
}
