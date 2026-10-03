import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createComment,
  deleteComment,
  updateComment,
} from "@/api/comments/comments";
import { getRecordedRequests, stubFetch } from "@/testing/fetchStub";
import { ITEM_ID, makeComment } from "@/testing/itemFixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

const COMMENT = makeComment();

describe("the comment routes", () => {
  it("posts a pinned comment with its pin unrounded, and answers with the comment", async () => {
    stubFetch({
      [`POST /api/items/${ITEM_ID}/comments`]: { body: COMMENT, status: 201 },
    });

    await expect(
      createComment({
        itemId: ITEM_ID,
        body: { body: "Hello", atSeconds: 4.25 },
      }),
    ).resolves.toEqual(COMMENT);
    expect(getRecordedRequests()).toEqual([
      {
        url: `/api/items/${ITEM_ID}/comments`,
        method: "POST",
        body: { body: "Hello", atSeconds: 4.25 },
      },
    ]);
  });

  it("posts an unpinned comment with no pin at all", async () => {
    stubFetch({
      [`POST /api/items/${ITEM_ID}/comments`]: { body: COMMENT, status: 201 },
    });

    await createComment({ itemId: ITEM_ID, body: { body: "Hello" } });
    expect(getRecordedRequests()).toEqual([
      {
        url: `/api/items/${ITEM_ID}/comments`,
        method: "POST",
        body: { body: "Hello" },
      },
    ]);
  });

  it("patches the comment's own path with the new body, and answers with the comment", async () => {
    stubFetch({
      [`PATCH /api/comments/${COMMENT.commentId}`]: {
        body: COMMENT,
        status: 200,
      },
    });

    await expect(
      updateComment({ commentId: COMMENT.commentId, body: { body: "Hi" } }),
    ).resolves.toEqual(COMMENT);
    expect(getRecordedRequests()).toEqual([
      {
        url: `/api/comments/${COMMENT.commentId}`,
        method: "PATCH",
        body: { body: "Hi" },
      },
    ]);
  });

  it("deletes one and reads the 204", async () => {
    stubFetch({
      [`DELETE /api/comments/${COMMENT.commentId}`]: {
        body: undefined,
        status: 204,
      },
    });

    await expect(deleteComment(COMMENT.commentId)).resolves.toBeUndefined();
    expect(getRecordedRequests()).toEqual([
      {
        url: `/api/comments/${COMMENT.commentId}`,
        method: "DELETE",
        body: undefined,
      },
    ]);
  });
});
