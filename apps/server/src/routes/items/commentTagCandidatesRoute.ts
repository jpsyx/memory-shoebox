import {
  commentTagCandidatesQuerySchema,
  itemIdParamsSchema,
  type CommentTagCandidatesResponse,
} from "@memory-shoebox/shared";
import type { FastifyRequest } from "fastify";
import { readCommentTagCandidates } from "../../commentTags/commentTagCandidateHelpers.ts";
import { requireViewer } from "../../http/requestContextHelpers.ts";
import { getVisibleItemOr404 } from "../../items/getVisibleItemOr404.ts";

/**
 * Lists selectable account references only after authorizing the caller's
 * item access.
 */
export async function getCommentTagCandidates(
  request: FastifyRequest,
): Promise<CommentTagCandidatesResponse> {
  const viewer = requireViewer(request);
  const { itemId } = itemIdParamsSchema.parse(request.params);
  const item = await getVisibleItemOr404({
    database: request.server.database,
    viewer,
    itemId,
  });
  const { q } = commentTagCandidatesQuerySchema.parse(request.query);
  return {
    members: await readCommentTagCandidates({
      database: request.server.database,
      viewer,
      item,
      query: q,
      b2: request.server.b2,
      now: request.server.clock().toISOString(),
    }),
  };
}
