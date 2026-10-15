import { makeItemDetail } from "@/testing/itemFixtureHelpers";
import { act, render } from "@testing-library/react";
import { StrictMode, useEffect, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMediaLoading } from "../MediaLoadingContext";
import type { MediaLoadingResources } from "../createMediaLoadingResources/createMediaLoadingResources";
import { MediaLoadingProvider } from "./MediaLoadingProvider";

const ITEM_ID: string = "10000000-0000-4000-8000-000000000001";
const DETAIL = makeItemDetail({ itemId: ITEM_ID });
const PREVIEW = {
  itemId: ITEM_ID,
  kind: DETAIL.kind,
  width: DETAIL.media.width,
  height: DETAIL.media.height,
  media: DETAIL.media,
};

type Props = { onResources: (resources: MediaLoadingResources) => void };
function Observer({ onResources }: Props): ReactNode {
  const resources = useMediaLoading();
  useEffect(() => {
    onResources(resources);
  }, [resources, onResources]);
  return null;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("media loading provider", () => {
  it("clears private state and invalidates captured epochs on member replacement and unmount", async () => {
    const observed: MediaLoadingResources[] = [];
    const onResources = (resources: MediaLoadingResources) => {
      observed.push(resources);
    };
    const tree = (memberId: string) => {
      return (
        <MediaLoadingProvider memberId={memberId} routeKey="/items/photo">
          <Observer onResources={onResources} />
        </MediaLoadingProvider>
      );
    };
    const view = render(tree("first"));
    const first = observed[0]!;
    first.previews.put([PREVIEW]);
    const epoch = first.previews.captureEpoch();
    view.rerender(tree("second"));
    await act(async () => {});
    const second = observed[1]!;
    expect(first.previews.read(ITEM_ID)).toBeUndefined();
    first.previews.put([PREVIEW], epoch);
    second.previews.put([PREVIEW], epoch);
    expect(first.previews.read(ITEM_ID)).toBeUndefined();
    expect(second.previews.read(ITEM_ID)).toBeUndefined();
    second.previews.put([PREVIEW]);
    view.unmount();
    await act(async () => {});
    expect(second.previews.read(ITEM_ID)).toBeUndefined();
  });

  it("preserves warmed route metadata but stops queued bytes on route exit and background visibility", async () => {
    vi.useFakeTimers();
    const observed: MediaLoadingResources[] = [];
    const onResources = (resources: MediaLoadingResources) => {
      observed.push(resources);
    };
    const tree = (routeKey: string) => {
      return (
        <MediaLoadingProvider memberId="first" routeKey={routeKey}>
          <Observer onResources={onResources} />
        </MediaLoadingProvider>
      );
    };
    const images: HTMLImageElement[] = [];
    vi.stubGlobal(
      "Image",
      vi.fn(function () {
        const image = document.createElement("img");
        images.push(image);
        return image;
      }),
    );
    const view = render(tree("/items/first"));
    const resources = observed[0]!;
    resources.previews.put([PREVIEW]);
    const schedule = () => {
      return resources.scheduler.schedule(
        [
          {
            itemId: ITEM_ID,
            rank: 0,
            kind: "photo",
            decode: false,
            source: {
              ...DETAIL.media.display!,
              expiresAt: new Date(Date.now() + 3600000).toISOString(),
            },
          },
        ],
        {
          memberId: "first",
          selectionKey: "first",
          visible: true,
          saveData: false,
          effectiveType: "4g",
        },
      );
    };
    schedule();
    view.rerender(tree("/settings"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(images).toHaveLength(0);
    expect(resources.previews.read(ITEM_ID)).toEqual(PREVIEW);
    schedule();
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(images).toHaveLength(0);
    visibility.mockRestore();
    view.unmount();
    await act(async () => {});
  });

  it("remains usable after the StrictMode cleanup probe", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(JSON.stringify({ items: [PREVIEW] }), {
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const observed: MediaLoadingResources[] = [];
    const onResources = (resources: MediaLoadingResources) => {
      observed.push(resources);
    };
    const view = render(
      <StrictMode>
        <MediaLoadingProvider memberId="first" routeKey="/">
          <Observer onResources={onResources} />
        </MediaLoadingProvider>
      </StrictMode>,
    );
    await act(async () => {});
    const resources = observed.at(-1)!;
    await expect(
      resources.readPreviews({
        itemIds: [ITEM_ID],
        purpose: "speculative-preview",
      }),
    ).resolves.toEqual([PREVIEW]);
    expect(resources.previews.read(ITEM_ID)).toEqual(PREVIEW);
    view.unmount();
    await act(async () => {});
  });
  it("fences the replacement's immediate speculative reads before deferred disposal", async () => {
    vi.useFakeTimers();
    const images: HTMLImageElement[] = [];
    vi.stubGlobal(
      "Image",
      vi.fn(function () {
        const image = document.createElement("img");
        images.push(image);
        return image;
      }),
    );
    const fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ items: [] }), {
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetch);
    let first: MediaLoadingResources | undefined;
    let secondRead: Promise<unknown> | undefined;
    const onResources = (resources: MediaLoadingResources) => {
      if (resources.memberId === "first") {
        first = resources;
      } else {
        secondRead = resources.readPreviews({
          itemIds: [ITEM_ID],
          purpose: "speculative-preview",
        });
      }
    };
    const tree = (memberId: string) => {
      return (
        <MediaLoadingProvider memberId={memberId} routeKey="/">
          <Observer onResources={onResources} />
        </MediaLoadingProvider>
      );
    };
    const view = render(tree("first"));
    first!.scheduler.schedule(
      [
        {
          itemId: ITEM_ID,
          rank: 0,
          kind: "photo",
          decode: false,
          source: {
            ...DETAIL.media.display!,
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
          },
        },
      ],
      {
        memberId: "first",
        selectionKey: "first",
        visible: true,
        saveData: false,
        effectiveType: "4g",
      },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(images).toHaveLength(1);
    view.rerender(tree("second"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => {
      images[0]!.dispatchEvent(new Event("load"));
      await vi.advanceTimersByTimeAsync(0);
    });
    await secondRead;
    expect(fetch).toHaveBeenCalledOnce();
    view.unmount();
    await act(async () => {});
  });
});
