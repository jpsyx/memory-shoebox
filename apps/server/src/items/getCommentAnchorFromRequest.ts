import type { CreateCommentRequest } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { ApiError } from "../http/ApiError.ts";
import type { VisibleItem } from "./getVisibleItemOr404.ts";

/** A comment's own moment and its optional one-level parent. */
export type CommentAnchor = {
  parentCommentId: string | null;
  atSeconds: number | null;
};

/** Validates a video parent in the write transaction and inherits its moment. */
export async function getCommentAnchorFromRequest(
  options: Readonly<{
    database: DatabaseExecutor;
    item: VisibleItem;
    request: Pick<CreateCommentRequest, "parentCommentId" | "atSeconds">;
  }>,
): Promise<CommentAnchor> {
  const parentCommentId = options.request.parentCommentId ?? null;
  if (parentCommentId === null) {
    return { parentCommentId, atSeconds: _getMomentFromRequest(options) };
  }
  const parent = await options.database
    .selectFrom("comments")
    .select("at_seconds")
    .where("id", "=", parentCommentId)
    .where("item_id", "=", options.item.itemId)
    .where("parent_comment_id", "is", null)
    .executeTakeFirst();
  if (options.item.kind !== "video" || parent === undefined) {
    throw ApiError.invalidRequest({
      parentCommentId: ["Replies need a top-level comment on this video."],
    });
  }
  return {
    parentCommentId,
    atSeconds: _getCommentMoment(parent.at_seconds),
  };
}

function _getMomentFromRequest(
  options: Readonly<{
    item: VisibleItem;
    request: Pick<CreateCommentRequest, "atSeconds">;
  }>,
): number | null {
  const atSeconds = options.request.atSeconds ?? null;
  if (atSeconds === null) {
    return null;
  }
  if (options.item.kind === "photo") {
    throw ApiError.invalidRequest({
      atSeconds: ["A photograph has no transport to pin a comment to."],
    });
  }
  return _getCommentMoment(
    Math.min(atSeconds, (options.item.durationMs ?? 0) / 1000),
  );
}

/** Whole-video comments include every position displayed as 0:00. */
function _getCommentMoment(atSeconds: number | null): number | null {
  return atSeconds === null || atSeconds < 1 ? null : atSeconds;
}
