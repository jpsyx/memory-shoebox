import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearCommentReaction,
  clearItemReaction,
  setCommentReaction,
  setItemReaction,
} from "@/api/reactions/reactions";
import { ITEM_ID } from "@/testing/itemFixtures";

/** One request as the server saw it. */
type Call = { url: string; method: string; body: unknown };

const calls: Call[] = [];

/** Answers every request with one body, and records what was asked. */
function _answerWith(body: unknown, status = 200): void {
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url: String(url),
        method: init?.method ?? "GET",
        body:
          init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      });
      return new Response(status === 204 ? null : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const COMMENT_ID = "018f0000-0000-7000-8000-00000000d101";
const SUMMARY = { kinds: [], myKind: null };

describe("the reaction routes", () => {
  it("sets one on an item and answers with the whole summary", async () => {
    _answerWith(SUMMARY);

    await expect(
      setItemReaction({ itemId: ITEM_ID, kind: "love" }),
    ).resolves.toEqual(SUMMARY);
    expect(calls).toEqual([
      {
        url: `/api/items/${ITEM_ID}/reaction`,
        method: "PUT",
        body: { kind: "love" },
      },
    ]);
  });

  it("takes one off an item with a bare DELETE", async () => {
    _answerWith(undefined, 204);

    await expect(clearItemReaction(ITEM_ID)).resolves.toBeUndefined();
    expect(calls).toEqual([
      {
        url: `/api/items/${ITEM_ID}/reaction`,
        method: "DELETE",
        body: undefined,
      },
    ]);
  });

  it("does the same two on a comment", async () => {
    _answerWith(SUMMARY);
    await setCommentReaction({ commentId: COMMENT_ID, kind: "care" });
    expect(calls).toEqual([
      {
        url: `/api/comments/${COMMENT_ID}/reaction`,
        method: "PUT",
        body: { kind: "care" },
      },
    ]);

    _answerWith(undefined, 204);
    await clearCommentReaction(COMMENT_ID);
    expect(calls).toEqual([
      {
        url: `/api/comments/${COMMENT_ID}/reaction`,
        method: "DELETE",
        body: undefined,
      },
    ]);
  });
});
