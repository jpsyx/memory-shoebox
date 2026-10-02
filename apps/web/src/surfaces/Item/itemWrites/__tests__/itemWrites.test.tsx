import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
  useQuery,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactionSummary } from "@memory-shoebox/shared";
import { itemQueryOptions } from "@/api/items/items";
import { markPileStale } from "@/surfaces/Item/itemWrites/itemWriteScope";
import {
  useCreateComment,
  useItemReaction,
} from "@/surfaces/Item/itemWrites/useConversation";
import { useDeleteItem } from "@/surfaces/Item/itemWrites/useDeleteItem";
import { useSetItemTags } from "@/surfaces/Item/itemWrites/useItemEdits";
import { callQueryFn } from "@/testing/callQueryFn";
import {
  BURST_ID,
  ITEM_ID,
  makeComment,
  makeItemDetail,
  SIGNED_IN,
} from "@/testing/itemFixtures";

/** One canned reply, optionally held until a test lets it go. */
type Reply = { status: number; body?: unknown; hold?: Promise<void> };

/** The item the viewer moves on to, in the case that moves. */
const OTHER_ITEM_ID = "018f0000-0000-7000-8000-00000000f002";

const ITEM_READ = `GET /api/items/${ITEM_ID}`;
const TAGS_PUT = `PUT /api/items/${ITEM_ID}/tags`;
const REACTION_PUT = `PUT /api/items/${ITEM_ID}/reaction`;
const REACTION_DELETE = `DELETE /api/items/${ITEM_ID}/reaction`;
const COMMENT_POST = `POST /api/items/${ITEM_ID}/comments`;
const ITEM_DELETE = `DELETE /api/items/${ITEM_ID}`;

const FORBIDDEN_SENTENCE =
  "You can no longer change this one. The page has caught up with what you may do.";

const FORBIDDEN_REPLY: Reply = {
  status: 403,
  body: { error: "item_edit_forbidden", message: "x" },
};

/** The summary the server answers with once the viewer loves the item. */
const LOVED_BY_ME: ReactionSummary = {
  kinds: [{ kind: "love", count: 1, members: [SIGNED_IN] }],
  myKind: "love",
};

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

/** A promise a test lets go of when it chooses, to hold one reply open. */
function _makeHold(): { hold: Promise<void>; letGo: () => void } {
  let letGo = () => {};
  const hold = new Promise<void>((resolve) => {
    letGo = resolve;
  });
  return { hold, letGo };
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

/** Waits until every write has settled, its answer applied or refused. */
async function _settled(queryClient: QueryClient): Promise<void> {
  await waitFor(() => {
    expect(queryClient.isMutating()).toBe(0);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a write that answers with the item", () => {
  it("puts the answer in the cache and asks for nothing else", async () => {
    const answer = makeItemDetail({
      tags: [{ tagId: "018f0000-0000-7000-8000-00000000e202", name: "beach" }],
    });
    _answer({ [TAGS_PUT]: { status: 200, body: answer } });
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
    expect(lines).toEqual([TAGS_PUT]);
  });

  it("asks for the item once more when the server refuses, and says why", async () => {
    _answer({
      [TAGS_PUT]: FORBIDDEN_REPLY,
      [ITEM_READ]: { status: 200, body: makeItemDetail() },
    });
    const queryClient = _clientHolding();
    const { result } = _renderWithClient(() => {
      useQuery(itemQueryOptions(ITEM_ID));
      return useSetItemTags(ITEM_ID);
    }, queryClient);
    // The page's own read on arriving, settled before anything is saved.
    await waitFor(() => {
      expect(lines).toEqual([ITEM_READ]);
      expect(queryClient.isFetching()).toBe(0);
    });

    act(() => {
      result.current.save(["beach"]);
    });

    await waitFor(() => {
      expect(result.current.error).toBe(FORBIDDEN_SENTENCE);
    });
    await waitFor(() => {
      expect(queryClient.isFetching()).toBe(0);
    });
    expect(lines).toEqual([ITEM_READ, TAGS_PUT, ITEM_READ]);
  });

  it("rides the page's own read when a refusal lands during it", async () => {
    const read = _makeHold();
    _answer({
      [TAGS_PUT]: FORBIDDEN_REPLY,
      [ITEM_READ]: { status: 200, body: makeItemDetail(), hold: read.hold },
    });
    const queryClient = _clientHolding();
    const { result } = _renderWithClient(() => {
      useQuery(itemQueryOptions(ITEM_ID));
      return useSetItemTags(ITEM_ID);
    }, queryClient);
    await waitFor(() => {
      expect(lines).toEqual([ITEM_READ]);
    });

    // Refused while the read on arriving is still out: that read is already
    // the catching up, and a second one would count a second open.
    act(() => {
      result.current.save(["beach"]);
    });
    await waitFor(() => {
      expect(result.current.error).toBe(FORBIDDEN_SENTENCE);
    });
    await act(async () => {
      read.letGo();
    });

    await waitFor(() => {
      expect(queryClient.isFetching()).toBe(0);
    });
    expect(lines).toEqual([ITEM_READ, TAGS_PUT]);
  });

  it("asks for nothing when nobody is looking at the item any more", async () => {
    _answer({ [TAGS_PUT]: FORBIDDEN_REPLY });
    const queryClient = _clientHolding();
    const { result } = _renderWithClient(() => {
      return useSetItemTags(ITEM_ID);
    }, queryClient);

    act(() => {
      result.current.save(["beach"]);
    });

    await waitFor(() => {
      expect(result.current.error).toBe(FORBIDDEN_SENTENCE);
    });
    expect(queryClient.isFetching()).toBe(0);
    expect(lines).toEqual([TAGS_PUT]);
  });
});

describe("marking the pile stale", () => {
  it("marks exactly the pile's five prefixes stale and refetches nothing", () => {
    const queryClient = new QueryClient();
    const queryFn = vi.fn(async () => {
      return "fresh";
    });
    const pileKeys = [
      ["timeline", "q=1"],
      ["timeline", "rail", "q=1"],
      ["filters", "facets", ""],
      ["tags", ""],
      ["people", ""],
      ["bursts", BURST_ID, "frames"],
    ];
    const otherKeys = [
      ["items", ITEM_ID],
      ["me"],
      ["members", "picker"],
      ["groups", "picker"],
    ];
    // Every one is observed, so a refetch of any of them would be sent.
    const unsubscribes = [...pileKeys, ...otherKeys].map((queryKey) => {
      queryClient.setQueryData(queryKey, "cached");
      const observer = new QueryObserver(queryClient, {
        queryKey,
        queryFn,
        staleTime: Infinity,
      });
      return observer.subscribe(() => {});
    });

    markPileStale(queryClient);

    const staleKeys = [...pileKeys, ...otherKeys].filter((queryKey) => {
      return queryClient.getQueryState(queryKey)?.isInvalidated === true;
    });
    expect(staleKeys).toEqual(pileKeys);
    expect(queryFn).not.toHaveBeenCalled();
    unsubscribes.forEach((unsubscribe) => {
      unsubscribe();
    });
  });
});

describe("a reaction", () => {
  it("shows the tap at once, and puts it back when it fails", async () => {
    const { hold, letGo } = _makeHold();
    _answer({
      [REACTION_PUT]: {
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
    const { hold, letGo } = _makeHold();
    _answer({
      [REACTION_PUT]: { status: 200, body: LOVED_BY_ME, hold },
      [REACTION_DELETE]: { status: 204 },
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
      expect(lines).toEqual([REACTION_PUT]);
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
    await _settled(queryClient);
    expect(lines).toEqual([REACTION_PUT, REACTION_DELETE]);
    expect(_cached(queryClient)?.reactions).toEqual({
      kinds: [],
      myKind: null,
    });
  });

  it("survives an earlier save's answer landing on top of the tap", async () => {
    const tagsSave = _makeHold();
    _answer({
      [TAGS_PUT]: {
        status: 200,
        body: makeItemDetail({ tags: [] }),
        hold: tagsSave.hold,
      },
      [REACTION_PUT]: { status: 200, body: LOVED_BY_ME },
    });
    const queryClient = _clientHolding();
    const { result } = _renderWithClient(() => {
      return {
        tags: useSetItemTags(ITEM_ID),
        reaction: useItemReaction({ itemId: ITEM_ID, viewer: SIGNED_IN }),
      };
    }, queryClient);

    // A tags save is out and held, so the tap's PUT queues behind it.
    act(() => {
      result.current.tags.save([]);
    });
    await waitFor(() => {
      expect(lines).toEqual([TAGS_PUT]);
    });
    act(() => {
      result.current.reaction.react("love");
    });
    expect(_cached(queryClient)?.reactions.myKind).toBe("love");

    // The tags answer is the item from before the tap, and it lands first.
    // The tap's own answer, after it, is what the cache must end with.
    await act(async () => {
      tagsSave.letGo();
    });
    await _settled(queryClient);
    expect(lines).toEqual([TAGS_PUT, REACTION_PUT]);
    expect(_cached(queryClient)?.reactions).toEqual(LOVED_BY_ME);
  });

  it("sends a tap queued on one item to that item, after moving on", async () => {
    const { hold, letGo } = _makeHold();
    _answer({
      [REACTION_PUT]: { status: 200, body: LOVED_BY_ME, hold },
      [REACTION_DELETE]: { status: 204 },
    });
    const queryClient = _clientHolding();
    let itemId = ITEM_ID;
    const { result, rerender } = _renderWithClient(() => {
      return useItemReaction({ itemId, viewer: SIGNED_IN });
    }, queryClient);

    act(() => {
      result.current.react("love");
    });
    await waitFor(() => {
      expect(lines).toEqual([REACTION_PUT]);
    });
    act(() => {
      result.current.react(null);
    });

    // The strip moves the viewer along the burst, which renders the same
    // hook again with another id rather than mounting a new one.
    itemId = OTHER_ITEM_ID;
    rerender();
    await act(async () => {
      letGo();
    });

    await _settled(queryClient);
    expect(
      lines.filter((line) => {
        return line.includes(OTHER_ITEM_ID);
      }),
    ).toEqual([]);
    expect(lines).toEqual([REACTION_PUT, REACTION_DELETE]);
  });
});

describe("a comment", () => {
  it("lands at the foot of the thread, and clears the field only then", async () => {
    const comment = makeComment({ author: SIGNED_IN, body: "Hello." });
    _answer({ [COMMENT_POST]: { status: 201, body: comment } });
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

  it("is posted once however fast Send is pressed twice", async () => {
    const { hold, letGo } = _makeHold();
    const comment = makeComment({ author: SIGNED_IN, body: "Hello." });
    _answer({ [COMMENT_POST]: { status: 201, body: comment, hold } });
    const queryClient = _clientHolding();
    const { result } = _renderWithClient(() => {
      return useCreateComment(ITEM_ID);
    }, queryClient);
    const onSent = vi.fn();

    // Both presses come from one render, before `isSending` could arrive.
    act(() => {
      result.current.send({ body: "Hello.", atSeconds: null }, onSent);
      result.current.send({ body: "Hello.", atSeconds: null }, onSent);
    });
    await act(async () => {
      letGo();
    });

    await _settled(queryClient);
    expect(lines).toEqual([COMMENT_POST]);
    expect(_cached(queryClient)?.comments).toEqual([comment]);
    expect(onSent).toHaveBeenCalledOnce();
  });
});

describe("the delete", () => {
  it("is sent once however fast Delete is pressed twice", async () => {
    const { hold, letGo } = _makeHold();
    _answer({ [ITEM_DELETE]: { status: 204, hold } });
    const queryClient = _clientHolding();
    const { result } = _renderWithClient(() => {
      return useDeleteItem(ITEM_ID);
    }, queryClient);
    const onDeleted = vi.fn();

    // Both presses come from one render, before `isDeleting` could arrive.
    act(() => {
      result.current.remove(onDeleted);
      result.current.remove(onDeleted);
    });
    await act(async () => {
      letGo();
    });

    await _settled(queryClient);
    expect(lines).toEqual([ITEM_DELETE]);
    expect(onDeleted).toHaveBeenCalledOnce();
  });
});
