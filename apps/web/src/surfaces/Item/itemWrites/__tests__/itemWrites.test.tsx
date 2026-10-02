import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { itemQueryOptions } from "@/api/items/items";
import {
  useCreateComment,
  useItemReaction,
} from "@/surfaces/Item/itemWrites/useConversation";
import { useSetItemTags } from "@/surfaces/Item/itemWrites/useItemEdits";
import { callQueryFn } from "@/testing/callQueryFn";
import {
  ITEM_ID,
  makeComment,
  makeItemDetail,
  SIGNED_IN,
} from "@/testing/itemFixtures";

/** One canned reply, optionally held until a test lets it go. */
type Reply = { status: number; body?: unknown; hold?: Promise<void> };

const lines: string[] = [];

/** Answers by `"METHOD /path"`, and records every request as one line. */
function _answer(replies: Readonly<Record<string, Reply>>): void {
  lines.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const line = `${init?.method ?? "GET"} ${String(url)}`;
      lines.push(line);
      const reply = replies[line] ?? {
        status: 404,
        body: { error: "not_found", message: "x" },
      };
      await reply.hold;
      return new Response(
        reply.status === 204 ? null : JSON.stringify(reply.body),
        {
          status: reply.status,
          headers: { "content-type": "application/json" },
        },
      );
    }),
  );
}

/**
 * A client holding one item, as if the page had already opened it.
 *
 * The defaults go in first, so the cached entry has the query function the
 * page's own `useQuery` would have given it: an entry made by `setQueryData`
 * alone has none, and a refetch of it would fail without sending anything.
 */
function _clientHolding(detail = makeItemDetail()): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const options = itemQueryOptions(ITEM_ID);
  queryClient.setQueryDefaults(options.queryKey, {
    queryFn: () => {
      return callQueryFn(options);
    },
  });
  queryClient.setQueryData(options.queryKey, detail);
  return queryClient;
}

/** Renders a hook against that client. */
function _renderWithClient<T>(hook: () => T, queryClient: QueryClient) {
  return renderHook(hook, {
    wrapper: ({ children }: { children: ReactNode }) => {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
    },
  });
}

/** What the cache holds for the item now. */
function _cached(queryClient: QueryClient) {
  return queryClient.getQueryData(itemQueryOptions(ITEM_ID).queryKey);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a write that answers with the item", () => {
  it("puts the answer in the cache and asks for nothing else", async () => {
    const answer = makeItemDetail({
      tags: [{ tagId: "018f0000-0000-7000-8000-00000000e202", name: "beach" }],
    });
    _answer({
      [`PUT /api/items/${ITEM_ID}/tags`]: { status: 200, body: answer },
    });
    const queryClient = _clientHolding();
    const { result } = _renderWithClient(() => {
      return useSetItemTags(ITEM_ID);
    }, queryClient);

    act(() => {
      result.current.save(["beach"]);
    });

    await waitFor(() => {
      expect(_cached(queryClient)?.tags).toEqual(answer.tags);
    });
    expect(lines).toEqual([`PUT /api/items/${ITEM_ID}/tags`]);
  });

  it("asks for the item once more when the server refuses, and says why", async () => {
    _answer({
      [`PUT /api/items/${ITEM_ID}/tags`]: {
        status: 403,
        body: { error: "item_edit_forbidden", message: "x" },
      },
      [`GET /api/items/${ITEM_ID}`]: { status: 200, body: makeItemDetail() },
    });
    const queryClient = _clientHolding();
    const { result } = _renderWithClient(() => {
      return useSetItemTags(ITEM_ID);
    }, queryClient);

    act(() => {
      result.current.save(["beach"]);
    });

    await waitFor(() => {
      expect(result.current.error).toBe(
        "You can no longer change this one. The page has caught up with what you may do.",
      );
    });
    await waitFor(() => {
      expect(lines).toContain(`GET /api/items/${ITEM_ID}`);
    });
  });
});

describe("a reaction", () => {
  it("shows the tap at once, and puts it back when it fails", async () => {
    let letGo = () => {};
    const hold = new Promise<void>((resolve) => {
      letGo = resolve;
    });
    _answer({
      [`PUT /api/items/${ITEM_ID}/reaction`]: {
        status: 500,
        body: { error: "internal", message: "x" },
        hold,
      },
    });
    const queryClient = _clientHolding();
    const { result } = _renderWithClient(() => {
      return useItemReaction({ itemId: ITEM_ID, viewer: SIGNED_IN });
    }, queryClient);

    act(() => {
      result.current.react("love");
    });
    await waitFor(() => {
      expect(_cached(queryClient)?.reactions.myKind).toBe("love");
    });

    await act(async () => {
      letGo();
    });
    await waitFor(() => {
      expect(_cached(queryClient)?.reactions.myKind).toBeNull();
    });
    expect(result.current.error).toBe(
      "That reaction did not go through, so it has been put back. Try again.",
    );
  });

  it("keeps a second tap when the first one's answer lands after it", async () => {
    let letGo = () => {};
    const hold = new Promise<void>((resolve) => {
      letGo = resolve;
    });
    _answer({
      [`PUT /api/items/${ITEM_ID}/reaction`]: {
        status: 200,
        body: {
          kinds: [{ kind: "love", count: 1, members: [SIGNED_IN] }],
          myKind: "love",
        },
        hold,
      },
      [`DELETE /api/items/${ITEM_ID}/reaction`]: { status: 204 },
    });
    const queryClient = _clientHolding();
    const { result } = _renderWithClient(() => {
      return useItemReaction({ itemId: ITEM_ID, viewer: SIGNED_IN });
    }, queryClient);

    // Love, and the PUT goes out and is held there.
    act(() => {
      result.current.react("love");
    });
    await waitFor(() => {
      expect(lines).toEqual([`PUT /api/items/${ITEM_ID}/reaction`]);
    });

    // Love again, which takes it off, before the PUT has answered.
    act(() => {
      result.current.react(null);
    });
    expect(_cached(queryClient)?.reactions.myKind).toBeNull();

    // The PUT answers "love" only now, and the DELETE queued behind it
    // follows. The late answer must not put the love back.
    await act(async () => {
      letGo();
    });
    await waitFor(() => {
      expect(lines).toEqual([
        `PUT /api/items/${ITEM_ID}/reaction`,
        `DELETE /api/items/${ITEM_ID}/reaction`,
      ]);
    });
    await waitFor(() => {
      expect(queryClient.isMutating()).toBe(0);
    });
    expect(_cached(queryClient)?.reactions).toEqual({
      kinds: [],
      myKind: null,
    });
  });
});

describe("a comment", () => {
  it("lands at the foot of the thread, and clears the field only then", async () => {
    const comment = makeComment({ author: SIGNED_IN, body: "Hello." });
    _answer({
      [`POST /api/items/${ITEM_ID}/comments`]: { status: 201, body: comment },
    });
    const queryClient = _clientHolding();
    const { result } = _renderWithClient(() => {
      return useCreateComment(ITEM_ID);
    }, queryClient);
    const onSent = vi.fn();

    act(() => {
      result.current.send({ body: "Hello.", atSeconds: null }, onSent);
    });

    await waitFor(() => {
      expect(_cached(queryClient)?.comments).toEqual([comment]);
    });
    expect(onSent).toHaveBeenCalledOnce();
  });
});
