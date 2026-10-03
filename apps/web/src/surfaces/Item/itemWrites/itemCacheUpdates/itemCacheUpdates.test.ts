import { describe, expect, it } from "vitest";
import {
  makeItemDetailFromCommentReactions,
  makeItemDetailFromDeletedComment,
  makeItemDetailFromItemReactions,
  makeItemDetailFromSavedComment,
} from "@/surfaces/Item/itemWrites/itemCacheUpdates/itemCacheUpdates";
import { makeComment, makeItemDetail, SIGNED_IN } from "@/testing/itemFixtures";

const FIRST = makeComment();
const SECOND = makeComment({
  commentId: "018f0000-0000-7000-8000-00000000d102",
  body: "Second.",
});
const LOVE = {
  kinds: [{ kind: "love" as const, count: 1, members: [SIGNED_IN] }],
  myKind: "love" as const,
};

describe("the cache updates", () => {
  it("appends a new comment at the foot of the thread", () => {
    const detail = makeItemDetail({ comments: [FIRST] });
    expect(
      makeItemDetailFromSavedComment({ detail, comment: SECOND }).comments,
    ).toEqual([FIRST, SECOND]);
  });

  it("replaces an edited comment where it stands", () => {
    const edited = { ...FIRST, body: "Edited." };
    const detail = makeItemDetail({ comments: [FIRST, SECOND] });
    expect(
      makeItemDetailFromSavedComment({ detail, comment: edited }).comments,
    ).toEqual([edited, SECOND]);
  });

  it("takes a deleted comment out", () => {
    const detail = makeItemDetail({ comments: [FIRST, SECOND] });
    expect(
      makeItemDetailFromDeletedComment({ detail, commentId: FIRST.commentId })
        .comments,
    ).toEqual([SECOND]);
  });

  it("puts a summary on the item", () => {
    const detail = makeItemDetail({ comments: [FIRST, SECOND] });
    const onItem = makeItemDetailFromItemReactions({ detail, reactions: LOVE });
    expect(onItem.reactions).toEqual(LOVE);
    expect(onItem.comments).toEqual([FIRST, SECOND]);
  });

  it("puts a summary on the one comment it names, and leaves the others", () => {
    const detail = makeItemDetail({ comments: [FIRST, SECOND] });
    const onComment = makeItemDetailFromCommentReactions({
      detail,
      commentId: SECOND.commentId,
      reactions: LOVE,
    });
    expect(onComment.comments[1]?.reactions).toEqual(LOVE);
    expect(onComment.comments[0]?.reactions).toEqual(FIRST.reactions);
  });
});
