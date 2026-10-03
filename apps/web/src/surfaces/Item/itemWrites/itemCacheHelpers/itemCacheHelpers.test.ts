import { describe, expect, it } from "vitest";
import {
  makeItemDetailFromCommentReactions,
  makeItemDetailFromDeletedComment,
  makeItemDetailFromItemReactions,
  makeItemDetailFromSavedComment,
} from "@/surfaces/Item/itemWrites/itemCacheHelpers/itemCacheHelpers";
import {
  LOVED_BY_SIGNED_IN,
  makeComment,
  makeItemDetail,
} from "@/testing/itemFixtures";

const FIRST = makeComment();
const SECOND = makeComment({
  commentId: "018f0000-0000-7000-8000-00000000d102",
  body: "Second.",
});

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
    const onItem = makeItemDetailFromItemReactions({
      detail,
      reactions: LOVED_BY_SIGNED_IN,
    });
    expect(onItem.reactions).toEqual(LOVED_BY_SIGNED_IN);
    expect(onItem.comments).toEqual([FIRST, SECOND]);
  });

  it("puts a summary on the one comment it names, and leaves the others", () => {
    const detail = makeItemDetail({ comments: [FIRST, SECOND] });
    const onComment = makeItemDetailFromCommentReactions({
      detail,
      commentId: SECOND.commentId,
      reactions: LOVED_BY_SIGNED_IN,
    });
    expect(onComment.comments[1]?.reactions).toEqual(LOVED_BY_SIGNED_IN);
    expect(onComment.comments[0]?.reactions).toEqual(FIRST.reactions);
  });
});
