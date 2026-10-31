import type { CommentTagInput } from "@memory-shoebox/shared";
import { describe, expect, it } from "vitest";
import {
  makeCommentDraftFromEdit,
  makeCommentDraftFromMemberSelection,
  getCommentTagQueryFromSelection,
} from "./commentDraftHelpers";
const member = {
  memberId: "00000000-0000-4000-8000-000000000001",
  displayName: "José María 😀",
  avatar: null,
};
const draft = {
  body: "Hi @Jorge!",
  commentTags: [
    { memberId: member.memberId, start: 3, end: 9, tagId: "saved" },
  ],
};
describe("reference-aware edits", () => {
  it("shifts later ranges, preserves boundary insertion, and never mutates the source", () => {
    expect(
      makeCommentDraftFromEdit({ draft, start: 3, end: 3, text: "Hi " })
        .commentTags[0],
    ).toEqual({ ...draft.commentTags[0], start: 6, end: 12 });
    expect(
      makeCommentDraftFromEdit({ draft, start: 9, end: 9, text: " 😀" })
        .commentTags,
    ).toEqual(draft.commentTags);
    expect(draft.body).toBe("Hi @Jorge!");
  });
  it("drops only references touched inside or replaced across a selection", () => {
    expect(
      makeCommentDraftFromEdit({ draft, start: 4, end: 5, text: "x" }),
    ).toEqual({ body: "Hi @xorge!", commentTags: [] });
    expect(
      makeCommentDraftFromEdit({ draft, start: 2, end: 10, text: "@Jorge" })
        .commentTags,
    ).toEqual([]);
    expect(
      makeCommentDraftFromEdit({ draft, start: 5, end: 5, text: "a" })
        .commentTags,
    ).toEqual([]);
  });
  it("creates only explicitly selected references, measuring UTF-16 and retaining all over-limit text", () => {
    const selected = makeCommentDraftFromMemberSelection({
      draft: { body: "😀 @Jo", commentTags: [] },
      start: 3,
      end: 6,
      member,
    });
    expect(selected).toEqual({
      body: "😀 @José María 😀 ",
      commentTags: [{ memberId: member.memberId, start: 3, end: 17 }],
    });
    expect(
      makeCommentDraftFromEdit({
        draft: { body: "", commentTags: [] },
        start: 0,
        end: 0,
        text: selected.body,
      }).commentTags,
    ).toEqual([]);
    expect(
      makeCommentDraftFromMemberSelection({
        draft: { body: "x".repeat(3999) + "@", commentTags: [] },
        start: 3999,
        end: 4000,
        member,
      }).body.length,
    ).toBeGreaterThan(4000);
  });
});
describe("query boundaries", () => {
  it.each(["@Jo", "Hello @Jo", "(@Jo", "Hi @José María"])(
    "accepts %s",
    (body) => {
      return expect(
        getCommentTagQueryFromSelection({
          body,
          start: body.length,
          end: body.length,
          commentTags: [],
        }),
      ).toBeDefined();
    },
  );
  it.each(["a@b", "hello@Jo", "@Jo\nX", "@a@b"])("rejects %s", (body) => {
    return expect(
      getCommentTagQueryFromSelection({
        body,
        start: body.length,
        end: body.length,
        commentTags: [],
      }),
    ).toBeUndefined();
  });
  it("does not reopen selected ranges or noncollapsed selection", () => {
    expect(
      getCommentTagQueryFromSelection({ ...draft, start: 6, end: 6 }),
    ).toBeUndefined();
    expect(
      getCommentTagQueryFromSelection({
        body: "@Jo",
        commentTags: [],
        start: 1,
        end: 3,
      }),
    ).toBeUndefined();
  });
});

it("preserves immutable occurrence provenance through shifts and restores only its acknowledged ID", async () => {
  const { makeCommentDraftFromSavedTagIds, recordSavedCommentTagIdsInPlace } =
    await import("./commentTagProvenance");
  const selected = makeCommentDraftFromMemberSelection({
    draft: { body: "  @", commentTags: [] },
    start: 2,
    end: 3,
    member,
  });
  const shifted = makeCommentDraftFromEdit({
    draft: selected,
    start: 0,
    end: 0,
    text: "😀 ",
  });
  const replacement = makeCommentDraftFromMemberSelection({
    draft: { body: selected.body, commentTags: [] },
    start: 2,
    end: selected.body.length,
    member,
  });
  const tagIds = new WeakMap<CommentTagInput, string>();
  recordSavedCommentTagIdsInPlace({
    submitted: selected,
    savedTags: [
      {
        memberId: member.memberId,
        tagId: "persisted",
        start: 0,
        end: 14,
        label: member.displayName,
      },
    ],
    tagIds,
  });
  const updated = makeCommentDraftFromSavedTagIds({ draft: shifted, tagIds });
  expect(updated.body).toBe(shifted.body);
  expect(updated.commentTags[0]).toMatchObject({
    tagId: "persisted",
    start: 5,
    end: 19,
  });
  expect(
    makeCommentDraftFromSavedTagIds({ draft: replacement, tagIds })
      .commentTags[0]?.tagId,
  ).toBeUndefined();
  expect(
    makeCommentDraftFromSavedTagIds({ draft: selected, tagIds }).commentTags[0]
      ?.tagId,
  ).toBe("persisted");
  expect(selected.commentTags[0]?.tagId).toBeUndefined();
  expect(shifted.commentTags[0]?.tagId).toBeUndefined();
  expect(JSON.parse(JSON.stringify(updated.commentTags[0]))).toEqual({
    memberId: member.memberId,
    start: 5,
    end: 19,
    tagId: "persisted",
  });
});
