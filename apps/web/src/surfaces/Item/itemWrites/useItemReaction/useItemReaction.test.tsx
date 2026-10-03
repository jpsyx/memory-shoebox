import { act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useItemReaction } from "@/surfaces/Item/itemWrites/useItemReaction/useItemReaction";
import { useSetItemTags } from "@/surfaces/Item/itemWrites/useSetItemTags";
import { getRecordedLines, stubFetch } from "@/testing/fetchStubHelpers";
import {
  ITEM_ID,
  LOVED_BY_SIGNED_IN,
  makeItemDetail,
  SIGNED_IN,
} from "@/testing/itemFixtureHelpers";
import {
  getCachedItemFromQueryClient,
  makeHold,
  makeQueryClientFromItemDetail,
  renderHookWithQueryClient,
  waitForWritesToSettle,
} from "@/testing/itemWriteTestHelpers";

/** The item the viewer moves on to, in the case that moves. */
const OTHER_ITEM_ID = "018f0000-0000-7000-8000-00000000f002";

const TAGS_PUT = `PUT /api/items/${ITEM_ID}/tags`;
const REACTION_PUT = `PUT /api/items/${ITEM_ID}/reaction`;
const REACTION_DELETE = `DELETE /api/items/${ITEM_ID}/reaction`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a reaction", () => {
  it("shows the tap at once, and puts it back when it fails", async () => {
    const { hold, letGo } = makeHold();
    stubFetch({
      [REACTION_PUT]: {
        status: 500,
        body: { error: "internal", message: "x" },
        waitFor: hold,
      },
    });
    const queryClient = makeQueryClientFromItemDetail();
    const { result } = renderHookWithQueryClient({
      useHook: () => {
        return useItemReaction({ itemId: ITEM_ID, viewer: SIGNED_IN });
      },
      queryClient,
    });

    act(() => {
      result.current.react("love");
    });
    await waitFor(() => {
      expect(getCachedItemFromQueryClient(queryClient)?.reactions.myKind).toBe(
        "love",
      );
    });

    await act(async () => {
      letGo();
    });
    await waitFor(() => {
      expect(
        getCachedItemFromQueryClient(queryClient)?.reactions.myKind,
      ).toBeNull();
    });
    expect(result.current.error).toBe(
      "That reaction did not go through, so it has been put back. Try again.",
    );
  });

  it("keeps a second tap when the first one's answer lands after it", async () => {
    const { hold, letGo } = makeHold();
    stubFetch({
      [REACTION_PUT]: { status: 200, body: LOVED_BY_SIGNED_IN, waitFor: hold },
      [REACTION_DELETE]: { body: undefined, status: 204 },
    });
    const queryClient = makeQueryClientFromItemDetail();
    const { result } = renderHookWithQueryClient({
      useHook: () => {
        return useItemReaction({ itemId: ITEM_ID, viewer: SIGNED_IN });
      },
      queryClient,
    });

    // Love, and the PUT goes out and is held there.
    act(() => {
      result.current.react("love");
    });
    await waitFor(() => {
      expect(getRecordedLines()).toEqual([REACTION_PUT]);
    });

    // Love again, which takes it off, before the PUT has answered.
    act(() => {
      result.current.react(null);
    });
    expect(
      getCachedItemFromQueryClient(queryClient)?.reactions.myKind,
    ).toBeNull();

    // The PUT answers "love" only now, and the DELETE queued behind it
    // follows. The late answer must not put the love back.
    await act(async () => {
      letGo();
    });
    await waitForWritesToSettle(queryClient);
    expect(getRecordedLines()).toEqual([REACTION_PUT, REACTION_DELETE]);
    expect(getCachedItemFromQueryClient(queryClient)?.reactions).toEqual({
      kinds: [],
      myKind: null,
    });
  });

  it("survives an earlier save's answer landing on top of the tap", async () => {
    const tagsSave = makeHold();
    stubFetch({
      [TAGS_PUT]: {
        status: 200,
        body: makeItemDetail({ tags: [] }),
        waitFor: tagsSave.hold,
      },
      [REACTION_PUT]: { status: 200, body: LOVED_BY_SIGNED_IN },
    });
    const queryClient = makeQueryClientFromItemDetail();
    const { result } = renderHookWithQueryClient({
      useHook: () => {
        return {
          tags: useSetItemTags(ITEM_ID),
          reaction: useItemReaction({ itemId: ITEM_ID, viewer: SIGNED_IN }),
        };
      },
      queryClient,
    });
    // A tags save is out and held, so the tap's PUT queues behind it.
    act(() => {
      result.current.tags.save({ variables: [] });
    });
    await waitFor(() => {
      expect(getRecordedLines()).toEqual([TAGS_PUT]);
    });
    act(() => {
      result.current.reaction.react("love");
    });
    expect(getCachedItemFromQueryClient(queryClient)?.reactions.myKind).toBe(
      "love",
    );

    // The tags answer is the item from before the tap, and it lands first.
    // The tap's own answer, after it, is what the cache must end with.
    await act(async () => {
      tagsSave.letGo();
    });
    await waitForWritesToSettle(queryClient);
    expect(getRecordedLines()).toEqual([TAGS_PUT, REACTION_PUT]);
    expect(getCachedItemFromQueryClient(queryClient)?.reactions).toEqual(
      LOVED_BY_SIGNED_IN,
    );
  });

  it("sends a tap queued on one item to that item, after moving on", async () => {
    const { hold, letGo } = makeHold();
    stubFetch({
      [REACTION_PUT]: { status: 200, body: LOVED_BY_SIGNED_IN, waitFor: hold },
      [REACTION_DELETE]: { body: undefined, status: 204 },
    });
    const queryClient = makeQueryClientFromItemDetail();
    let itemId = ITEM_ID;
    const { result, rerender } = renderHookWithQueryClient({
      useHook: () => {
        return useItemReaction({ itemId, viewer: SIGNED_IN });
      },
      queryClient,
    });

    act(() => {
      result.current.react("love");
    });
    await waitFor(() => {
      expect(getRecordedLines()).toEqual([REACTION_PUT]);
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

    await waitForWritesToSettle(queryClient);
    expect(
      getRecordedLines().filter((line) => {
        return line.includes(OTHER_ITEM_ID);
      }),
    ).toEqual([]);
    expect(getRecordedLines()).toEqual([REACTION_PUT, REACTION_DELETE]);
  });
});
