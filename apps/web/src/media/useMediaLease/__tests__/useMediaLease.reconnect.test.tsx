import { act, renderHook } from "@testing-library/react";

import { expect, it, vi } from "vitest";

import { useMediaLease } from "../useMediaLease";
import {
  createLeaseHarness,
  detail,
  installUseMediaLeaseTestLifecycle,
  makeMediaFromExpiry,
} from "./useMediaLeaseTestHelpers";
installUseMediaLeaseTestLifecycle();

it("retains a failed network source without a timer loop, then retries once on reconnect and retires that listener", async () => {
  const setup = createLeaseHarness();
  setup.fetcher.mockRejectedValueOnce(new TypeError("Network is offline"));
  const view = renderHook(() => {
    return useMediaLease({
      itemId: detail.itemId,
      initialMedia: makeMediaFromExpiry(),
      purpose: "selected-view",
      isVisible: true,
    });
  }, setup);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_001);
  });
  expect(view.result.current.media?.playback?.url).toContain("old.mp4");
  expect(view.result.current.hasError).toBe(true);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500_000);
  });
  expect(setup.fetcher).toHaveBeenCalledOnce();
  await act(async () => {
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(setup.fetcher).toHaveBeenCalledTimes(2);
  expect(view.result.current.media?.playback?.url).toContain("renewed.mp4");
  expect(view.result.current.hasError).toBe(false);
  view.unmount();
  setup.resources.dispose();
  await act(async () => {
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(3_600_000);
  });
  expect(setup.fetcher).toHaveBeenCalledTimes(2);
});

it("does not retry denied media when connectivity returns", async () => {
  const setup = createLeaseHarness();
  setup.fetcher.mockResolvedValueOnce(
    new Response(JSON.stringify({ items: [] })),
  );
  const view = renderHook(() => {
    return useMediaLease({
      itemId: detail.itemId,
      initialMedia: makeMediaFromExpiry(),
      purpose: "selected-view",
      isVisible: true,
    });
  }, setup);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_001);
  });
  expect(view.result.current.media).toBeUndefined();
  await act(async () => {
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(3_600_000);
  });
  expect(setup.fetcher).toHaveBeenCalledOnce();
  view.unmount();
  setup.resources.dispose();
});

it("cannot restart a failed transient renewal after its owner retires", async () => {
  const setup = createLeaseHarness();
  setup.fetcher.mockRejectedValueOnce(new TypeError("Network is offline"));
  const view = renderHook(() => {
    return useMediaLease({
      itemId: detail.itemId,
      initialMedia: makeMediaFromExpiry(),
      purpose: "selected-view",
      isVisible: true,
    });
  }, setup);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_001);
  });
  expect(view.result.current.hasError).toBe(true);
  view.unmount();
  setup.resources.dispose();
  await act(async () => {
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(3_600_000);
  });
  expect(setup.fetcher).toHaveBeenCalledOnce();
});
