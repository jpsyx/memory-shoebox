import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearCommentReaction,
  clearItemReaction,
  setCommentReaction,
  setItemReaction,
} from "@/api/reactions/reactions";
import { getRecordedRequests, stubFetch } from "@/testing/fetchStubHelpers";
import { ITEM_ID } from "@/testing/itemFixtureHelpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

const COMMENT_ID = "018f0000-0000-7000-8000-00000000d101";
const SUMMARY = { kinds: [], myKind: null };

describe("the reaction routes", () => {
  it("sets one on an item and answers with the whole summary", async () => {
    stubFetch({
      [`PUT /api/items/${ITEM_ID}/reaction`]: { body: SUMMARY, status: 200 },
    });

    await expect(
      setItemReaction({ itemId: ITEM_ID, kind: "love" }),
    ).resolves.toEqual(SUMMARY);
    expect(getRecordedRequests()).toEqual([
      {
        url: `/api/items/${ITEM_ID}/reaction`,
        method: "PUT",
        body: { kind: "love" },
      },
    ]);
  });

  it("takes one off an item with a bare DELETE", async () => {
    stubFetch({
      [`DELETE /api/items/${ITEM_ID}/reaction`]: {
        body: undefined,
        status: 204,
      },
    });

    await expect(clearItemReaction(ITEM_ID)).resolves.toBeUndefined();
    expect(getRecordedRequests()).toEqual([
      {
        url: `/api/items/${ITEM_ID}/reaction`,
        method: "DELETE",
        body: undefined,
      },
    ]);
  });

  it("sets one on a comment at the comment's own route and answers with the whole summary", async () => {
    stubFetch({
      [`PUT /api/comments/${COMMENT_ID}/reaction`]: {
        body: SUMMARY,
        status: 200,
      },
    });

    await expect(
      setCommentReaction({ commentId: COMMENT_ID, kind: "care" }),
    ).resolves.toEqual(SUMMARY);
    expect(getRecordedRequests()).toEqual([
      {
        url: `/api/comments/${COMMENT_ID}/reaction`,
        method: "PUT",
        body: { kind: "care" },
      },
    ]);
  });

  it("takes one off a comment with a bare DELETE", async () => {
    stubFetch({
      [`DELETE /api/comments/${COMMENT_ID}/reaction`]: {
        body: undefined,
        status: 204,
      },
    });

    await expect(clearCommentReaction(COMMENT_ID)).resolves.toBeUndefined();
    expect(getRecordedRequests()).toEqual([
      {
        url: `/api/comments/${COMMENT_ID}/reaction`,
        method: "DELETE",
        body: undefined,
      },
    ]);
  });
});
