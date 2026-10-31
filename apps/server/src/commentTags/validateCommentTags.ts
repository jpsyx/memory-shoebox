import type { CommentTag, CommentTagInput } from "@memory-shoebox/shared";
import { createId } from "../db/createId.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { ApiError } from "../http/ApiError.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import type { VisibleItem } from "../items/getVisibleItemOr404.ts";
import { readEligibleCommentTagMembers } from "./readCommentTagCandidates.ts";

function _tagConflict(
  code: "comment_tag_stale" | "comment_tag_unavailable",
  index: number,
): ApiError {
  return ApiError.conflict({
    code,
    details: { fieldErrors: { [`commentTags.${index}`]: [code] } },
  });
}

function _getValidatedOccurrence(
  options: Readonly<{
    body: string;
    existing: ReadonlyMap<string, CommentTag>;
    eligible: ReadonlyMap<string, string>;
    retainedIds: Set<string>;
  }>,
  input: Readonly<CommentTagInput>,
  index: number,
): CommentTag {
  const stored =
    input.tagId === undefined ? undefined : options.existing.get(input.tagId);
  if (input.tagId !== undefined) {
    if (
      stored === undefined ||
      options.retainedIds.has(input.tagId) ||
      stored.memberId !== input.memberId
    )
      throw _tagConflict("comment_tag_stale", index);
    options.retainedIds.add(input.tagId);
  }
  const label = stored?.label ?? options.eligible.get(input.memberId);
  if (label === undefined) throw _tagConflict("comment_tag_unavailable", index);
  if (options.body.slice(input.start, input.end) !== `@${label}`)
    throw _tagConflict("comment_tag_stale", index);
  return {
    tagId: stored?.tagId ?? createId(),
    memberId: input.memberId,
    start: input.start,
    end: input.end,
    label,
  };
}

/** Validates fresh identities against current names/access and retained IDs against their stored snapshots. */
export async function validateCommentTags(
  options: Readonly<{
    database: DatabaseExecutor;
    viewer: Viewer;
    item: VisibleItem;
    body: string;
    commentTags: readonly CommentTagInput[];
    existingTags: readonly CommentTag[];
  }>,
): Promise<CommentTag[]> {
  const retainedIds = new Set<string>();
  const existing = new Map(
    options.existingTags.map((tag) => {
      return [tag.tagId, tag];
    }),
  );
  const memberIds = options.commentTags.flatMap((tag) => {
    return tag.tagId === undefined ? [tag.memberId] : [];
  });
  const members = await readEligibleCommentTagMembers({
    database: options.database,
    itemId: options.item.itemId,
    memberIds: [...new Set(memberIds)],
  });
  const eligible = new Map(
    members.map((member) => {
      return [member.memberId, member.displayName];
    }),
  );
  return options.commentTags.map((input, index) => {
    return _getValidatedOccurrence(
      { body: options.body, existing, eligible, retainedIds },
      input,
      index,
    );
  });
}
