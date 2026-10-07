import { act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useVideoReactions } from "./useVideoReactions";
import { videoReactionsQueryOptions } from "@/api/videoReactions/videoReactions";
import { getRecordedRequests, stubFetch } from "@/testing/fetchStubHelpers";
import { ITEM_ID, SIGNED_IN } from "@/testing/itemFixtureHelpers";
import {
  makeQueryClientFromItemDetail,
  renderHookWithQueryClient,
  makeHold,
  waitForWritesToSettle,
} from "@/testing/itemWriteTestHelpers";
const REACTION_ID = "018f0000-0000-7000-8000-00000000a101";
const PATH = `/api/items/${ITEM_ID}/video-reactions`;
const REACTION = {
  reactionId: REACTION_ID,
  author: SIGNED_IN,
  emoji: "😂" as const,
  atSeconds: 4.37,
  createdAt: "2026-09-14T05:00:00.000Z",
  canDelete: true,
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("video reaction writes", () => {
  it("reloads visible reactions after a stale deletion permission is refused", async () => {
    stubFetch({ [`GET ${PATH}`]: { status: 200, body: [REACTION] } });
    const queryClient = makeQueryClientFromItemDetail();
    const { result } = renderHookWithQueryClient({
      queryClient,
      useHook: () => {
        return useVideoReactions({ itemId: ITEM_ID, enabled: true });
      },
    });
    await waitFor(() => {
      expect(result.current.reactions).toHaveLength(1);
    });
    stubFetch({
      [`GET ${PATH}`]: {
        status: 200,
        body: [{ ...REACTION, canDelete: false }],
      },
      [`DELETE ${PATH}/${REACTION_ID}`]: {
        status: 403,
        body: {
          error: "video_reaction_delete_forbidden",
          message: "Forbidden",
        },
      },
    });
    act(() => {
      result.current.remove(REACTION);
    });
    await waitFor(() => {
      expect(result.current.writeError).toBeDefined();
    });
    await waitFor(() => {
      expect(result.current.reactions[0]?.canDelete).toBe(false);
    });
  });

  it("does not let an older read erase a newly persisted reaction", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(REACTION_ID);
    const read = makeHold();
    stubFetch({
      [`GET ${PATH}`]: { status: 200, body: [], waitFor: read.hold },
      [`PUT ${PATH}/${REACTION_ID}`]: { status: 201, body: REACTION },
    });
    const queryClient = makeQueryClientFromItemDetail();
    queryClient.setQueryData(videoReactionsQueryOptions(ITEM_ID).queryKey, []);
    const { result } = renderHookWithQueryClient({
      queryClient,
      useHook: () => {
        return useVideoReactions({ itemId: ITEM_ID, enabled: true });
      },
    });
    await waitFor(() => {
      expect(getRecordedRequests()).toHaveLength(1);
    });
    act(() => {
      result.current.react({ emoji: "😂", atSeconds: 4.37 });
    });
    await waitFor(() => {
      expect(result.current.reactions).toHaveLength(1);
    });
    await act(async () => {
      read.letGo();
    });
    await waitForWritesToSettle(queryClient);
    expect(result.current.reactions).toHaveLength(1);
  });

  it("keeps a failed ID and timestamp for retry without a ghost marker", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(REACTION_ID);
    stubFetch({
      [`GET ${PATH}`]: { status: 200, body: [] },
      [`PUT ${PATH}/${REACTION_ID}`]: {
        status: 500,
        body: { error: "internal", message: "Failed" },
      },
    });
    const queryClient = makeQueryClientFromItemDetail();
    const { result } = renderHookWithQueryClient({
      queryClient,
      useHook: () => {
        return useVideoReactions({ itemId: ITEM_ID, enabled: true });
      },
    });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    act(() => {
      result.current.react({ emoji: "😂" as const, atSeconds: 4.37 });
    });
    await waitFor(() => {
      expect(result.current.writeError).toBeDefined();
    });
    expect(result.current.reactions).toEqual([]);
    stubFetch({
      [`PUT ${PATH}/${REACTION_ID}`]: { status: 201, body: REACTION },
    });
    act(() => {
      result.current.retry();
    });
    await waitFor(() => {
      expect(result.current.reactions).toHaveLength(1);
    });
    expect(getRecordedRequests()[0]).toMatchObject({
      method: "PUT",
      url: `${PATH}/${REACTION_ID}`,
      body: { emoji: "😂" as const, atSeconds: 4.37 },
    });
  });
  it("removes private cached reactions after a visibility refusal", async () => {
    stubFetch({
      [`GET ${PATH}`]: {
        status: 404,
        body: { error: "not_found", message: "Missing" },
      },
    });
    const queryClient = makeQueryClientFromItemDetail();
    queryClient.setQueryData(videoReactionsQueryOptions(ITEM_ID).queryKey, [
      REACTION,
    ]);
    const { result } = renderHookWithQueryClient({
      queryClient,
      useHook: () => {
        return useVideoReactions({ itemId: ITEM_ID, enabled: true });
      },
    });
    await waitFor(() => {
      expect(result.current.readError).toBeDefined();
    });
    expect(result.current.reactions).toEqual([]);
    expect(
      queryClient.getQueryData(videoReactionsQueryOptions(ITEM_ID).queryKey),
    ).toEqual([]);
  });
});
