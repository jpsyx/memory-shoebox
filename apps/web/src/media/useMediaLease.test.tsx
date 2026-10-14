import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaRef } from "@memory-shoebox/shared";
import { makeVideoDetail } from "@/testing/itemFixtureHelpers";
import { MediaLoadingContext } from "./MediaLoadingContext";
import {
  createMediaLoadingLifetime,
  createMediaLoadingResources,
} from "./createMediaLoadingResources";
import { useMediaLease } from "./useMediaLease";

const detail = makeVideoDetail();
function _media(expires = 120_000, suffix = "old"): MediaRef {
  return {
    ...detail.media,
    thumb: {
      ...detail.media.thumb!,
      expiresAt: new Date(expires).toISOString(),
    },
    poster: null,
    playback: {
      ...detail.media.playback!,
      purpose: "original",
      url: `https://example.invalid/${suffix}.mp4`,
      expiresAt: new Date(expires).toISOString(),
    },
  };
}
function _setup() {
  const resources = createMediaLoadingResources({
    memberId: "first",
    lifetime: createMediaLoadingLifetime(),
  });
  const requests: Array<{ itemIds: string[]; purpose: string }> = [];
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as {
      itemIds: string[];
      purpose: string;
    };
    requests.push(body);
    return new Response(
      JSON.stringify({
        items: body.itemIds.map((itemId) => {
          return {
            itemId,
            kind: "video",
            width: 1600,
            height: 1067,
            media: _media(3_600_000, "renewed"),
          };
        }),
      }),
    );
  });
  vi.stubGlobal("fetch", fetcher);
  const wrapper = ({ children }: { children: ReactNode }) => {
    return (
      <MediaLoadingContext value={resources}>{children}</MediaLoadingContext>
    );
  };
  return { resources, requests, fetcher, wrapper };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("authorized visible media leases", () => {
  it("seeds authorized sources and renews selected original without another detail read", async () => {
    const setup = _setup();
    const { result } = renderHook(() => {
      return useMediaLease({
        itemId: detail.itemId,
        initialMedia: _media(),
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
  it("batches only visible IDs in groups of eight and renews on hidden-tab return", async () => {
    const setup = _setup();
    const ids = Array.from({ length: 10 }, (_, index) => {
      return `018f0000-0000-7000-8000-${String(index).padStart(12, "0")}`;
    });
    ids.forEach((itemId, index) => {
      return renderHook(() => {
        return useMediaLease({
          itemId,
          initialMedia: _media(),
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
  it("drops denied media, does not loop, and rejects late member responses", async () => {
    const setup = _setup();
    setup.fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [] })),
    );
    const { result } = renderHook(() => {
      return useMediaLease({
        itemId: detail.itemId,
        initialMedia: _media(),
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

it("cancels queued renewal when the last visible consumer unmounts", async () => {
  const setup = _setup();
  const view = renderHook(() => {
    return useMediaLease({
      itemId: detail.itemId,
      initialMedia: _media(),
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
it("does not restore state after member clear even when the transport completes late", async () => {
  const setup = _setup();
  let finish!: (response: Response) => void;
  setup.fetcher.mockImplementationOnce(() => {
    return new Promise<Response>((resolve) => {
      finish = resolve;
    });
  });
  const view = renderHook(() => {
    return useMediaLease({
      itemId: detail.itemId,
      initialMedia: _media(),
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
              media: _media(3_600_000, "late"),
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
  const setup = _setup();
  let finish!: (response: Response) => void;
  setup.fetcher.mockImplementationOnce(() => {
    return new Promise<Response>((resolve) => {
      finish = resolve;
    });
  });
  const selected = renderHook(() => {
    return useMediaLease({
      itemId: detail.itemId,
      initialMedia: _media(),
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
      initialMedia: _media(),
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
              media: _media(3_600_000, "late"),
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
it("shares media updates with visible fan and sibling consumers but excludes overscan", async () => {
  const setup = _setup();
  const registrations = [true, true, true, false].map((isVisible, index) => {
    return renderHook(() => {
      return useMediaLease({
        itemId: `018f0000-0000-7000-8000-${String(index).padStart(12, "0")}`,
        initialMedia: _media(),
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
it.each([401, 403, 404])(
  "does not loop after a %s authorization failure",
  async (status) => {
    const setup = _setup();
    setup.fetcher.mockResolvedValue(
      new Response(
        JSON.stringify({ error: "not_allowed", message: "No access" }),
        { status },
      ),
    );
    const view = renderHook(() => {
      return useMediaLease({
        itemId: detail.itemId,
        initialMedia: _media(),
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
it("does not overwrite a newly authorized rendition with an older renewal completion", async () => {
  const setup = _setup();
  let finish!: (response: Response) => void;
  setup.fetcher.mockImplementationOnce(() => {
    return new Promise<Response>((resolve) => {
      finish = resolve;
    });
  });
  const authorizedMedia = _media();
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
    ..._media(3_600_000, "new-rendition"),
    playback: {
      ..._media(3_600_000, "new-rendition").playback!,
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
              media: _media(3_600_000, "old-completion"),
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
it("does not reseed denied media when cached tile props remount", async () => {
  const setup = _setup();
  setup.fetcher.mockResolvedValue(new Response(JSON.stringify({ items: [] })));
  const useLeaseTest = () => {
    return useMediaLease({
      itemId: detail.itemId,
      initialMedia: _media(),
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
  const setup = _setup();
  setup.fetcher.mockResolvedValueOnce(
    new Response(JSON.stringify({ items: [] })),
  );
  const view = renderHook(() => {
    return useMediaLease({
      itemId: detail.itemId,
      initialMedia: _media(),
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

it("reschedules a visible lease when an unrelated denial invalidates its in-flight epoch", async () => {
  const setup = _setup();
  let finish!: (response: Response) => void;
  setup.fetcher.mockImplementationOnce(() => {
    return new Promise<Response>((resolve) => {
      finish = resolve;
    });
  });
  const view = renderHook(() => {
    return useMediaLease({
      itemId: detail.itemId,
      initialMedia: _media(),
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
              media: _media(3_600_000, "discarded"),
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
    const setup = _setup();
    setup.fetcher.mockResolvedValueOnce(new Response("", { status }));
    const view = renderHook(() => {
      return useMediaLease({
        itemId: detail.itemId,
        initialMedia: _media(),
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
                media: _media(180_000, "recovered"),
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
