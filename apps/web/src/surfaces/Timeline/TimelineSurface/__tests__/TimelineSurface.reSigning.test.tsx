import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  makeDay,
  makeItem,
  makeMediaSource,
} from "@/surfaces/Timeline/timelineFixtures";
import { getRecordedBodyFromRequest } from "@/testing/surfaceHarness";
import {
  recordedUrls,
  renderTimeline,
  respondWith,
} from "./TimelineSurface.fixtures";

describe("visible timeline signature renewal", () => {
  afterEach(() => {
    return vi.unstubAllGlobals();
  });
  it("renews only visible tile IDs without refetching retained pages or changing provenance", async () => {
    const observers: Array<{
      callback: IntersectionObserverCallback;
      nodes: Element[];
      visibleMedia: boolean;
    }> = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        readonly entry: (typeof observers)[number];
        constructor(
          callback: IntersectionObserverCallback,
          options?: IntersectionObserverInit,
        ) {
          this.entry = {
            callback,
            nodes: [],
            visibleMedia: options?.rootMargin === "0px",
          };
          observers.push(this.entry);
        }
        observe(node: Element) {
          this.entry.nodes.push(node);
        }
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
      },
    );
    const soon = new Date(Date.now() + 59_000).toISOString();
    const visible = makeItem({
      itemId: "018f0000-0000-7000-8000-000000000001",
      media: {
        ...makeItem().media,
        thumb: makeMediaSource({ expiresAt: soon }),
      },
    });
    const hidden = makeItem({
      itemId: "018f0000-0000-7000-8000-000000000002",
      media: {
        ...makeItem().media,
        thumb: makeMediaSource({ expiresAt: soon }),
      },
    });
    const renewed = {
      ...visible.media,
      thumb: makeMediaSource({ url: "https://example.invalid/renewed.jpg" }),
    };
    respondWith({
      "GET /api/timeline": {
        body: {
          previousCursor: null,
          days: [makeDay({ items: [visible, hidden], itemCount: 2 })],
          nextCursor: null,
          resultCount: null,
        },
        status: 200,
      },
      "POST /api/media/preview": {
        body: {
          items: [
            {
              itemId: visible.itemId,
              kind: "photo",
              width: visible.media.width,
              height: visible.media.height,
              media: renewed,
            },
          ],
        },
        status: 200,
      },
    });
    const { container, router } = renderTimeline();
    await screen.findAllByRole("button", { name: /cartoon baby/i });
    const print = container.querySelector(
      `[data-item-id="${visible.itemId}"]`,
    )!;
    const queriesBefore = router.options.context!.queryClient.getQueriesData({
      queryKey: ["timeline"],
    });
    act(() => {
      observers
        .filter((observer) => {
          return observer.visibleMedia && observer.nodes.includes(print);
        })
        .forEach((observer) => {
          observer.callback(
            [
              {
                target: print,
                isIntersecting: true,
                intersectionRatio: 1,
              } as IntersectionObserverEntry,
            ],
            {} as IntersectionObserver,
          );
        });
    });
    await waitFor(() => {
      return expect(print.querySelector("img")).toHaveAttribute(
        "src",
        renewed.thumb.url,
      );
    });
    expect(getRecordedBodyFromRequest("POST /api/media/preview")).toEqual({
      itemIds: [visible.itemId],
      purpose: "speculative-preview",
    });
    expect(
      recordedUrls().filter((url) => {
        return url.split("?")[0] === "/api/timeline";
      }),
    ).toHaveLength(1);
    expect(
      router.options.context!.queryClient.getQueriesData({
        queryKey: ["timeline"],
      }),
    ).toEqual(queriesBefore);
    expect(container.querySelector(`[data-item-id="${visible.itemId}"]`)).toBe(
      print,
    );
  });
});
