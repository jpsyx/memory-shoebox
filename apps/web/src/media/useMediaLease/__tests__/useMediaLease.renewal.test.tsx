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

it("does not overwrite a newly authorized rendition with an older renewal completion", async () => {
  const setup = createLeaseHarness();
  let finish!: (response: Response) => void;
  setup.fetcher.mockImplementationOnce(() => {
    return new Promise<Response>((resolve) => {
      finish = resolve;
    });
  });
  const authorizedMedia = makeMediaFromExpiry();
  const view = renderHook(
    ({ initialMedia }) => {
      return useMediaLease({
        itemId: detail.itemId,
        initialMedia,
        purpose: "selected-view",
        isVisible: true,
      });
    },
    { ...setup, initialProps: { initialMedia: authorizedMedia } },
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_001);
  });
  const newMedia = {
    ...makeMediaFromExpiry(3_600_000, "new-rendition"),
    playback: {
      ...makeMediaFromExpiry(3_600_000, "new-rendition").playback!,
      renditionId: "new-rendition",
    },
  };
  view.rerender({ initialMedia: newMedia });
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
              media: makeMediaFromExpiry(3_600_000, "old-completion"),
            },
          ],
        }),
      ),
    );
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(view.result.current.media?.playback?.renditionId).toBe(
    "new-rendition",
  );
  expect(
    setup.resources.previews.read(detail.itemId)?.media.playback?.renditionId,
  ).toBe("new-rendition");
  setup.resources.dispose();
});

it("reschedules a visible lease when an unrelated denial invalidates its in-flight epoch", async () => {
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
  // Removing another refused item invalidates all already captured write tokens.
  setup.resources.previews.remove("another-item");
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
              media: makeMediaFromExpiry(3_600_000, "discarded"),
            },
          ],
        }),
      ),
    );
    await vi.advanceTimersByTimeAsync(10);
  });
  expect(setup.fetcher).toHaveBeenCalledTimes(2);
  expect(view.result.current.media?.playback?.url).toContain("renewed");
  setup.resources.dispose();
});

it.each([
  { status: 401, completesWhileHidden: true },
  { status: 403, completesWhileHidden: false },
])(
  "observes tab return after authorization recovery ($status, hidden=$completesWhileHidden)",
  async ({ status, completesWhileHidden }) => {
    const setup = createLeaseHarness();
    setup.fetcher.mockResolvedValueOnce(new Response("", { status }));
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
    let finish!: (response: Response) => void;
    setup.fetcher.mockImplementationOnce(() => {
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    });
    await act(async () => {
      const pending = view.result.current.renew();
      await vi.advanceTimersByTimeAsync(1);
      if (completesWhileHidden) {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          value: "hidden",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      }
      finish(
        new Response(
          JSON.stringify({
            items: [
              {
                itemId: detail.itemId,
                kind: "video",
                width: 1600,
                height: 1067,
                media: makeMediaFromExpiry(180_000, "recovered"),
              },
            ],
          }),
        ),
      );
      await pending;
    });
    expect(view.result.current.media?.playback?.url).toContain("recovered");
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(setup.fetcher).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(2);
    });
    expect(setup.fetcher).toHaveBeenCalledTimes(3);
    expect(view.result.current.media?.playback?.url).toContain("renewed");
    expect(
      setup.fetcher.mock.calls.every(([url]) => {
        return url === "/api/media/preview";
      }),
    ).toBe(true);
    setup.resources.dispose();
  },
);
