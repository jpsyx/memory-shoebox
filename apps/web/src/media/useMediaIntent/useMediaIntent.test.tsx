import type { SpeculativeMediaLoader } from "../mediaPrefetch.types";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMediaLoadingResources } from "../createMediaLoadingResources/createMediaLoadingResources";
import { createMediaLoadingLifetime } from "../createMediaLoadingResources/createMediaLoadingLifetime";
import { makeMediaWrapperFromResources } from "@/testing/makeMediaWrapperFromResources";
import {
  PREVIEW,
  ITEM_ID,
  SECOND_ID,
} from "../createMediaLoadingResources/__tests__/createMediaLoadingResourcesTestHelpers";
import { useMediaIntent } from "./useMediaIntent";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function _makeHarness(preview = PREVIEW) {
  const load = vi.fn<SpeculativeMediaLoader>(async () => {
    return {
      release: vi.fn(),
    };
  });
  const resources = createMediaLoadingResources({
    memberId: "first",
    lifetime: createMediaLoadingLifetime(),
    load,
  });
  resources.previews.put({
    previews: [preview],
    epoch: resources.previews.captureEpoch(),
  });
  const hook = renderHook(
    ({ enabled }) => {
      return useMediaIntent(ITEM_ID, enabled);
    },
    {
      initialProps: { enabled: true },
      wrapper: makeMediaWrapperFromResources(resources),
    },
  );
  return { ...hook, resources, load };
}

it("warms image bytes after 100ms even when preview metadata is cached", async () => {
  const { result, resources, load, unmount } = _makeHarness();
  act(() => {
    return result.current.onPointerEnter();
  });
  await act(() => {
    return vi.advanceTimersByTimeAsync(99);
  });
  expect(load).not.toHaveBeenCalled();
  await act(() => {
    return vi.advanceTimersByTimeAsync(2);
  });
  expect(load).toHaveBeenCalledOnce();
  expect(load.mock.calls[0]?.[0]).toEqual(
    expect.objectContaining({
      candidate: expect.objectContaining({ itemId: ITEM_ID }),
    }),
  );
  unmount();
  resources.dispose();
});

it("cancels a short hover and never warms in selection mode", async () => {
  const { result, rerender, resources, load, unmount } = _makeHarness();
  act(() => {
    return result.current.onPointerEnter();
  });
  await act(() => {
    return vi.advanceTimersByTimeAsync(99);
  });
  act(() => {
    return result.current.onPointerLeave();
  });
  await act(() => {
    return vi.advanceTimersByTimeAsync(500);
  });
  expect(load).not.toHaveBeenCalled();
  rerender({ enabled: false });
  act(() => {
    return result.current.onPointerEnter();
  });
  await act(() => {
    return vi.advanceTimersByTimeAsync(500);
  });
  expect(load).not.toHaveBeenCalled();
  unmount();
  resources.dispose();
});

it.each(["unmount", "member"])("retires dwell on %s", async (reason) => {
  const { result, resources, load, unmount } = _makeHarness();
  act(() => {
    return result.current.onFocus();
  });
  if (reason === "unmount") {
    unmount();
  } else {
    resources.clearMember();
  }
  await act(() => {
    return vi.advanceTimersByTimeAsync(500);
  });
  expect(load).not.toHaveBeenCalled();
  unmount();
  resources.dispose();
});

it("deduplicates repeated intent and supersedes a pending different photo", async () => {
  const { resources, load, unmount } = _makeHarness();
  resources.previews.put({
    previews: [{ ...PREVIEW, itemId: SECOND_ID }],
    epoch: resources.previews.captureEpoch(),
  });
  const leaveFirst = resources.intent.enter(ITEM_ID);
  await vi.advanceTimersByTimeAsync(80);
  resources.intent.enter(SECOND_ID);
  leaveFirst();
  resources.intent.enter(SECOND_ID);
  await vi.advanceTimersByTimeAsync(99);
  expect(load).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(2);
  expect(load).toHaveBeenCalledOnce();
  expect(load.mock.calls[0]?.[0].candidate.itemId).toBe(SECOND_ID);
  unmount();
  resources.dispose();
});

it("pointer down warms without waiting for the remaining hover dwell", async () => {
  const { result, resources, load, unmount } = _makeHarness();
  result.current.onPointerEnter();
  await vi.advanceTimersByTimeAsync(40);
  result.current.onPointerDown();
  await vi.advanceTimersByTimeAsync(1);
  expect(load).toHaveBeenCalledOnce();
  unmount();
  resources.dispose();
});

it("fetches display metadata when a timeline preview aliases its thumb as display", async () => {
  const fetchPreview = vi.fn(async () => {
    return new Response(JSON.stringify({ items: [PREVIEW] }), {
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchPreview);
  const { result, resources, load, unmount } = _makeHarness({
    ...PREVIEW,
    media: {
      ...PREVIEW.media,
      display: PREVIEW.media.thumb,
      displayCandidates: [PREVIEW.media.thumb!],
    },
  });
  result.current.onPointerEnter();
  await vi.advanceTimersByTimeAsync(101);
  expect(fetchPreview).toHaveBeenCalledOnce();
  expect(load.mock.calls[0]?.[0].candidate.source.purpose).toBe("display");
  unmount();
  resources.dispose();
});
