import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createComment,
  deleteComment,
  updateComment,
} from "@/api/comments/comments";
import { ITEM_ID, makeComment } from "@/testing/itemFixtures";

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

const COMMENT = makeComment();

describe("the comment routes", () => {
  it("says something on an item, pinned or not", async () => {
    _answerWith(COMMENT, 201);

    await expect(
      createComment({
        itemId: ITEM_ID,
        body: { body: "Hello", atSeconds: 4.25 },
      }),
    ).resolves.toEqual(COMMENT);
    expect(calls).toEqual([
      {
        url: `/api/items/${ITEM_ID}/comments`,
        method: "POST",
        body: { body: "Hello", atSeconds: 4.25 },
      },
    ]);
  });

  it("edits the body and nothing else", async () => {
    _answerWith(COMMENT);

    await updateComment({ commentId: COMMENT.commentId, body: { body: "Hi" } });
    expect(calls).toEqual([
      {
        url: `/api/comments/${COMMENT.commentId}`,
        method: "PATCH",
        body: { body: "Hi" },
      },
    ]);
  });

  it("deletes one and reads the 204", async () => {
    _answerWith(undefined, 204);

    await expect(deleteComment(COMMENT.commentId)).resolves.toBeUndefined();
    expect(calls).toEqual([
      {
        url: `/api/comments/${COMMENT.commentId}`,
        method: "DELETE",
        body: undefined,
      },
    ]);
  });
});
