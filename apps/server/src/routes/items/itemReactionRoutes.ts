import type { FastifyReply, FastifyRequest } from "fastify";
import {
  itemIdParamsSchema,
  setReactionRequestSchema,
  type ReactionSummary,
} from "@memory-shoebox/shared";
import { readMemberRefs } from "../../archive/readMemberRefs.ts";
import { createId } from "../../db/createId.ts";
import { requireViewer } from "../../http/requestContextHelpers.ts";
import { getVisibleItemOr404 } from "../../items/getVisibleItemOr404.ts";
import {
  makeEmptyReactionSummary,
  makeReactionSummariesFromRows,
  readItemReactionRows,
} from "../../items/readReactionSummaries.ts";

// One reaction per member per thing: the unique constraint is the whole of
// the rule. Setting is one `INSERT ... ON CONFLICT DO UPDATE`; pressing the
// one already left is a `DELETE`. Both answer `404`, never `403`, when the
// item is invisible: reacting on an invisible item would leak it just as
// surely as opening it.

/** `PUT /items/:itemId/reaction`: set or replace the viewer's own. */
export async function putItemReaction(
  request: FastifyRequest,
): Promise<ReactionSummary> {
  const viewer = requireViewer(request);
  const { itemId } = itemIdParamsSchema.parse(request.params);
  const { kind } = setReactionRequestSchema.parse(request.body);
  const now = request.server.clock().toISOString();

  const item = await getVisibleItemOr404({
    database: request.server.database,
    viewer,
    itemId,
  });

  await request.server.database
    .insertInto("item_reactions")
    .values({
      id: createId(),
      item_id: item.itemId,
      member_id: viewer.memberId,
      kind,
      created_at: now,
    })
    .onConflict((conflict) => {
      // `created_at` is deliberately not touched, so the moment somebody
      // first said something stands and the order inside a kind stays
      // stable when they change their mind.
      return conflict.columns(["item_id", "member_id"]).doUpdateSet({ kind });
    })
    .execute();

  return (
    makeReactionSummariesFromRows({
      rows: await readItemReactionRows({
        database: request.server.database,
        itemId: item.itemId,
      }),
      members: await readMemberRefs(request.server.database),
      viewerMemberId: viewer.memberId,
    }).get(item.itemId) ?? makeEmptyReactionSummary()
  );
}

/** `DELETE /items/:itemId/reaction`: clear the viewer's own. */
export async function deleteItemReaction(
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

  // Deleting a reaction that is not there is a 204, not a 404: the route
  // is idempotent and the outcome the caller asked for holds either way.
  // The 404 is about the item, never about the reaction.
  await request.server.database
    .deleteFrom("item_reactions")
    .where("item_id", "=", item.itemId)
    .where("member_id", "=", viewer.memberId)
    .execute();

  return reply.code(204).send();
}
