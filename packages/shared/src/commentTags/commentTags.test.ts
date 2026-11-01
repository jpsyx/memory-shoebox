import { describe, expect, it } from "vitest";
import { makeNormalizedCommentFromDraft } from "./commentTags.ts";

const MEMBER_ID = "0192f2a0-7d3c-7000-8000-000000000001";
const TAG_ID = "0192f2a0-7d3c-7000-8000-000000000002";

describe("makeNormalizedCommentFromDraft", () => {
  it("shifts UTF-16 ranges with trimmed text while preserving retained identity", () => {
    const draft = {
      body: "  😀 @Jorge  ",
      commentTags: [{ memberId: MEMBER_ID, start: 5, end: 11, tagId: TAG_ID }],
    };
    expect(makeNormalizedCommentFromDraft(draft)).toEqual({
      body: "😀 @Jorge",
      commentTags: [{ memberId: MEMBER_ID, start: 3, end: 9, tagId: TAG_ID }],
    });
    expect(draft.commentTags[0]?.start).toBe(5);
  });
  it("keeps plain @ text untagged and repeated adjacent occurrences separate", () => {
    expect(
      makeNormalizedCommentFromDraft({ body: " @Jorge ", commentTags: [] }),
    ).toEqual({ body: "@Jorge", commentTags: [] });
    expect(
      makeNormalizedCommentFromDraft({
        body: "@A@A",
        commentTags: [
          { memberId: MEMBER_ID, start: 0, end: 2 },
          { memberId: MEMBER_ID, start: 2, end: 4 },
        ],
      }).commentTags,
    ).toHaveLength(2);
  });
  it.each([
    [0, 2],
    [2, 4],
    [4, 5],
    [2, 6],
  ])("rejects trimmed whitespace or split surrogate at %i:%i", (start, end) => {
    expect(() => {
      return makeNormalizedCommentFromDraft({
        body: "  @😀  ",
        commentTags: [{ memberId: MEMBER_ID, start, end }],
      });
    }).toThrow();
  });
  it("rejects descending raw ranges even if both would fit after trimming", () => {
    expect(() => {
      return makeNormalizedCommentFromDraft({
        body: " @A @B ",
        commentTags: [
          { memberId: MEMBER_ID, start: 4, end: 6 },
          { memberId: MEMBER_ID, start: 1, end: 3 },
        ],
      });
    }).toThrow();
  });
});
