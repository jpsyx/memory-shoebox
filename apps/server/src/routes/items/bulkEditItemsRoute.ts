import { bulkEditItemsRequestSchema } from "@memory-shoebox/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import { runInImmediateTransaction } from "../../db/runInImmediateTransaction.ts";
import { requireViewer } from "../../http/requestContextHelpers.ts";
import { bulkEditItems } from "../../items/bulkEditItems/bulkEditItems.ts";

/** Applies one timeline bulk action atomically without recording item opens. */
export async function postBulkEditItems(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const viewer = requireViewer(request);
  const body = bulkEditItemsRequestSchema.parse(request.body);
  const now = request.server.clock().toISOString();
  await runInImmediateTransaction({
    database: request.server.database,
    callback: (transaction) => {
      return bulkEditItems({ transaction, viewer, body, now });
    },
  });
  return reply.code(204).send();
}
