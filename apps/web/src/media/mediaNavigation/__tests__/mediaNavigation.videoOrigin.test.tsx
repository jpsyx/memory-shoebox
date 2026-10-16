import { MediaNavigationVideoOrigin } from "./MediaNavigationVideoOrigin";
import type { MediaRef, MediaPreview } from "@memory-shoebox/shared";

import { act, fireEvent, render, screen } from "@testing-library/react";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createMediaLoadingResources,
  type MediaLoadingResources,
} from "../../createMediaLoadingResources/createMediaLoadingResources";
import { createMediaLoadingLifetime } from "../../createMediaLoadingResources/createMediaLoadingLifetime";

import { MediaLoadingProvider } from "../../MediaLoadingProvider/MediaLoadingProvider";

import { PhotoFrame } from "@/surfaces/Item/ItemViewer/PhotoFrame/PhotoFrame";

import { makeItemDetail } from "@/testing/itemFixtureHelpers";

import { makeMediaSource } from "@/surfaces/Timeline/timelineFixtureHelpers";

const boundaryThumb = makeMediaSource({
  renditionId: "boundary-thumb",
  width: 400,
  height: 267,
  url: "https://example.invalid/boundary-thumb.jpg",
  expiresAt: "2099-01-01T00:00:00Z",
});

const boundaryDisplay = makeMediaSource({
  renditionId: "boundary-display",
  width: 1600,
  height: 1067,
  url: "https://example.invalid/boundary-display.jpg",
  expiresAt: "2099-01-01T00:00:00Z",
});

const boundaryMedia = {
  ...makeItemDetail().media,
  thumb: boundaryThumb,
  display: boundaryDisplay,
  displayCandidates: [boundaryDisplay],
} satisfies MediaRef;

const boundaryPreview = {
  itemId: "target",
  kind: "photo" as const,
  width: 1600,
  height: 1067,
  media: boundaryMedia,
} satisfies MediaPreview;

const injected = vi.hoisted(() => {
  return {
    resources: undefined as MediaLoadingResources | undefined,
    router: { state: { location: {} }, navigate: vi.fn<() => Promise<void>>() },
  };
});

vi.mock("../../useMediaLoadingResources", () => {
  return {
    useMediaLoadingResources: () => {
      return injected.resources;
    },
  };
});

vi.mock("@tanstack/react-router", () => {
  return {
    useRouter: () => {
      return injected.router;
    },
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("viewer promotion ownership", () => {
  it.each([undefined, 800])(
    "adopts the unsettled candidate warmed from direct video with prior width %s",
    async (priorWidth) => {
      vi.useFakeTimers();
      vi.stubGlobal("innerWidth", 450);
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
        width: 402,
      } as DOMRect);
      let signal: AbortSignal | undefined;
      const loaded: string[] = [];
      const resources = createMediaLoadingResources({
        memberId: "member",
        lifetime: createMediaLoadingLifetime(),
        load: ({ candidate, signal: operationSignal }) => {
          loaded.push(candidate.source.renditionId);
          signal = operationSignal;
          return new Promise(() => {});
        },
      });
      if (priorWidth !== undefined) {
        resources.navigation.viewport = {
          cssWidth: priorWidth,
          cssHeight: 600,
          devicePixelRatio: 1,
          supportsWebp: false,
        };
      }
      resources.previews.put({ previews: [boundaryPreview] });
      injected.resources = resources;
      let finish = () => {};
      injected.router.navigate.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
      );
      const view = render(
        <MediaLoadingProvider memberId="member" routeKey="/items/video">
          <MediaNavigationVideoOrigin preview={boundaryPreview} />
        </MediaLoadingProvider>,
      );
      const video = view.container.querySelector("video")!;
      Object.defineProperty(video, "readyState", {
        configurable: true,
        value: 2,
      });
      fireEvent.loadedData(video);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(250);
      });
      expect(loaded).toEqual(["boundary-thumb"]);
      fireEvent.click(screen.getByRole("button", { name: "Move" }));
      view.rerender(
        <MediaLoadingProvider memberId="member" routeKey="/items/target">
          <PhotoFrame media={boundaryMedia} itemId="target" />
        </MediaLoadingProvider>,
      );
      await act(async () => {
        finish();
      });
      const image =
        view.container.querySelector<HTMLImageElement>("picture img")!;
      expect(image.src).toBe(boundaryThumb.url);
      expect(signal?.aborted).toBe(false);
      fireEvent.load(image);
      await act(async () => {});
      expect(
        view.container.querySelector("[data-photo-ready=true]"),
      ).not.toBeNull();
      view.unmount();
      await act(async () => {});
      expect(signal?.aborted).toBe(true);
    },
  );
});
