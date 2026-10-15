import { act, renderHook } from "@testing-library/react";

import { describe, expect, it, vi } from "vitest";

import type { MediaRef } from "@memory-shoebox/shared";

import { useMediaLease } from "../useMediaLease";
import {
  createLeaseHarness,
  detail,
  installUseMediaLeaseTestLifecycle,
  makeMediaFromExpiry,
} from "./useMediaLeaseTestHelpers";
installUseMediaLeaseTestLifecycle();
describe("authorized visible media leases", () => {
  it("seeds authorized sources and renews selected original without another detail read", async () => {
    const setup = createLeaseHarness();
    const { result } = renderHook(() => {
      return useMediaLease({
        itemId: detail.itemId,
        initialMedia: makeMediaFromExpiry(),
        purpose: "selected-view",
        isVisible: true,
      });
    }, setup);
    expect(setup.fetcher).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_001);
    });
    expect(setup.requests).toEqual([
      { itemIds: [detail.itemId], purpose: "selected-view" },
    ]);
    expect(result.current.media?.playback?.purpose).toBe("original");
    expect(result.current.media?.playback?.url).toContain("renewed");
    setup.resources.dispose();
  });
});
describe("authorized visible media leases", () => {
  it("batches only visible IDs in groups of eight and renews on hidden-tab return", async () => {
    const setup = createLeaseHarness();
    const ids = Array.from({ length: 10 }, (_, index) => {
      return `018f0000-0000-7000-8000-${String(index).padStart(12, "0")}`;
    });
    ids.forEach((itemId, index) => {
      return renderHook(() => {
        return useMediaLease({
          itemId,
          initialMedia: makeMediaFromExpiry(),
          purpose: "speculative-preview",
          isVisible: index < 9,
        });
      }, setup);
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(180_000);
    });
    expect(setup.requests).toHaveLength(0);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(
      setup.requests.map((request) => {
        return request.itemIds.length;
      }),
    ).toEqual([8, 1]);
    expect(
      setup.requests.flatMap((request) => {
        return request.itemIds;
      }),
    ).toEqual(ids.slice(0, 9));
    setup.resources.dispose();
  });
});

it("cancels queued renewal when the last visible consumer unmounts", async () => {
  const setup = createLeaseHarness();
  const view = renderHook(() => {
    return useMediaLease({
      itemId: detail.itemId,
      initialMedia: makeMediaFromExpiry(),
      purpose: "selected-view",
      isVisible: true,
    });
  }, setup);
  let renewal: Promise<MediaRef | undefined>;
  act(() => {
    renewal = view.result.current.renew();
  });
  view.unmount();
  await vi.advanceTimersByTimeAsync(1);
  expect(setup.fetcher).not.toHaveBeenCalled();
  expect(await renewal!).toBeUndefined();
  setup.resources.dispose();
});

it("shares media updates with visible fan and sibling consumers but excludes overscan", async () => {
  const setup = createLeaseHarness();
  const registrations = [true, true, true, false].map((isVisible, index) => {
    return renderHook(() => {
      return useMediaLease({
        itemId: `018f0000-0000-7000-8000-${String(index).padStart(12, "0")}`,
        initialMedia: makeMediaFromExpiry(),
        purpose: "speculative-preview",
        isVisible,
      });
    }, setup);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_001);
  });
  expect(setup.requests[0]?.itemIds).toHaveLength(3);
  expect(registrations[3]!.result.current.media?.playback?.url).toContain(
    "old",
  );
  setup.resources.dispose();
});

it("rechecks automatic visibility at queue flush but permits an invisible explicit retry", async () => {
  const setup = createLeaseHarness();
  const hook = renderHook(
    ({ isVisible }) => {
      return useMediaLease({
        itemId: detail.itemId,
        initialMedia: makeMediaFromExpiry(),
        purpose: "speculative-preview",
        isVisible,
      });
    },
    { wrapper: setup.wrapper, initialProps: { isVisible: true } },
  );
  await act(async () => {
    return vi.advanceTimersByTimeAsync(60_000);
  });
  expect(setup.requests).toHaveLength(0);
  hook.rerender({ isVisible: false });
  await act(async () => {
    return vi.advanceTimersByTimeAsync(1);
  });
  expect(setup.requests).toHaveLength(0);
  await act(async () => {
    const pending = hook.result.current.renew();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
  });
  expect(setup.requests).toHaveLength(1);
});
