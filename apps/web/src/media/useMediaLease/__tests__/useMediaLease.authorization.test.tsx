import { act, renderHook } from "@testing-library/react";

import { describe, expect, it, vi } from "vitest";

import { useMediaLease } from "../useMediaLease";
import {
  createLeaseHarness,
  detail,
  installUseMediaLeaseTestLifecycle,
  makeMediaFromExpiry,
} from "./useMediaLeaseTestHelpers";
installUseMediaLeaseTestLifecycle();
describe("authorized visible media leases", () => {
  it("drops denied media, does not loop, and rejects late member responses", async () => {
    const setup = createLeaseHarness();
    setup.fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [] })),
    );
    const { result } = renderHook(() => {
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
    expect(result.current.media).toBeUndefined();
    expect(result.current.hasError).toBe(true);
    expect(setup.resources.previews.read(detail.itemId)).toBeUndefined();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(3_600_000);
    });
    expect(setup.fetcher).toHaveBeenCalledOnce();
    setup.resources.dispose();
  });
});

it("does not restore state after member clear even when the transport completes late", async () => {
  const setup = createLeaseHarness();
  let finish!: (response: Response) => void;
  setup.fetcher.mockImplementationOnce(() => {
    return new Promise<Response>((resolve) => {
      finish = resolve;
    });
  });
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
  act(() => {
    return setup.resources.clearMember();
  });
  await act(async () => {
    finish(
      new Response(
        JSON.stringify({
          items: [
            {
              itemId: detail.itemId,
              kind: "video",
              width: 1600,
              height: 1067,
              media: makeMediaFromExpiry({ expires: 3600000, suffix: "late" }),
            },
          ],
        }),
      ),
    );
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(view.result.current.media).toBeUndefined();
  expect(setup.resources.previews.read(detail.itemId)).toBeUndefined();
  expect(setup.fetcher).toHaveBeenCalledOnce();
  setup.resources.dispose();
});

it("rejects a late selected response after the visible thumbnail loses authorization", async () => {
  const setup = createLeaseHarness();
  let finish!: (response: Response) => void;
  setup.fetcher.mockImplementationOnce(() => {
    return new Promise<Response>((resolve) => {
      finish = resolve;
    });
  });
  const selected = renderHook(() => {
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
  setup.fetcher.mockResolvedValueOnce(
    new Response(JSON.stringify({ items: [] })),
  );
  const thumb = renderHook(() => {
    return useMediaLease({
      itemId: detail.itemId,
      initialMedia: makeMediaFromExpiry(),
      purpose: "speculative-preview",
      isVisible: true,
    });
  }, setup);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2);
  });
  expect(thumb.result.current.media).toBeUndefined();
  await act(async () => {
    finish(
      new Response(
        JSON.stringify({
          items: [
            {
              itemId: detail.itemId,
              kind: "video",
              width: 1600,
              height: 1067,
              media: makeMediaFromExpiry({ expires: 3600000, suffix: "late" }),
            },
          ],
        }),
      ),
    );
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(selected.result.current.media).toBeUndefined();
  expect(setup.resources.previews.read(detail.itemId)).toBeUndefined();
  expect(setup.fetcher).toHaveBeenCalledTimes(2);
  setup.resources.dispose();
});

it.each([401, 403, 404])(
  "does not loop after a %s authorization failure",
  async (status) => {
    const setup = createLeaseHarness();
    setup.fetcher.mockResolvedValue(
      new Response(
        JSON.stringify({ error: "not_allowed", message: "No access" }),
        { status },
      ),
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
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(100_000);
    });
    expect(setup.fetcher).toHaveBeenCalledOnce();
    setup.resources.dispose();
  },
);

it("does not reseed denied media when cached tile props remount", async () => {
  const setup = createLeaseHarness();
  setup.fetcher.mockResolvedValue(new Response(JSON.stringify({ items: [] })));
  const useLeaseTest = () => {
    return useMediaLease({
      itemId: detail.itemId,
      initialMedia: makeMediaFromExpiry(),
      purpose: "selected-view",
      isVisible: true,
    });
  };
  const first = renderHook(useLeaseTest, setup);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_001);
  });
  expect(first.result.current.media).toBeUndefined();
  first.unmount();
  const replacement = renderHook(useLeaseTest, setup);
  expect(replacement.result.current.media).toBeUndefined();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100_000);
  });
  expect(setup.fetcher).toHaveBeenCalledOnce();
  expect(setup.resources.previews.read(detail.itemId)).toBeUndefined();
  setup.resources.dispose();
});

it("recovers denied media only after an explicit fresh authorized safe read", async () => {
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
    const pending = view.result.current.renew();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
  });
  expect(view.result.current.media?.playback?.url).toContain("renewed");
  expect(setup.fetcher).toHaveBeenCalledTimes(2);
  setup.resources.dispose();
});
