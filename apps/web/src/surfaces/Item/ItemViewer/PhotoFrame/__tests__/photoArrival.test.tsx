import { MediaLoadingContext } from "@/media/MediaLoadingContext";
import { createMediaLoadingResources } from "@/media/createMediaLoadingResources/createMediaLoadingResources";
import { createMediaLoadingLifetime } from "@/media/createMediaLoadingResources/createMediaLoadingLifetime";
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { makeItemDetail } from "@/testing/itemFixtureHelpers";
import {
  clearPhotoTransition,
  stagePhotoTransition,
} from "@/system/motion/photoTransition/photoTransition";
import { PhotoFrame } from "../PhotoFrame";

afterEach(() => {
  clearPhotoTransition();
  delete (Element.prototype as Partial<Element>).animate;
  delete (HTMLImageElement.prototype as Partial<HTMLImageElement>).decode;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  { hasViewport: false, isPreview: false },
  { hasViewport: true, isPreview: false },
  { hasViewport: true, isPreview: true },
])(
  "waits for committed selected decode: $hasViewport viewport, $isPreview preview",
  async ({ hasViewport, isPreview }) => {
    const animate = vi.fn(() => {
      return {
        finished: new Promise(() => {}),
        cancel: vi.fn(),
      };
    });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      left: 20,
      top: 100,
      width: 620,
      height: 400,
      bottom: 500,
    } as DOMRect);
    Object.defineProperty(Element.prototype, "animate", {
      configurable: true,
      value: animate,
    });
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(
      true,
    );
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(
      800,
    );
    let finishDecode = () => {};
    Object.defineProperty(HTMLImageElement.prototype, "decode", {
      configurable: true,
      value: () => {
        return new Promise<void>((resolve) => {
          finishDecode = resolve;
        });
      },
    });
    const source = document.createElement("div");
    source.dataset.photoSurface = "pile";
    source.append(document.createElement("img"));
    stagePhotoTransition(source, "photo-a");
    history.replaceState({}, "", "/items/photo-a");
    const resources = createMediaLoadingResources({
      memberId: "first",
      lifetime: createMediaLoadingLifetime(),
    });
    if (hasViewport) {
      resources.navigation.viewport = {
        cssWidth: 620,
        cssHeight: 500,
        devicePixelRatio: 1,
        supportsWebp: true,
        supportsAvif: false,
      };
    }
    const view = render(
      <MediaLoadingContext value={resources}>
        <PhotoFrame
          media={makeItemDetail().media}
          itemId="photo-a"
          presentation={isPreview ? "preview" : "selected"}
        />
      </MediaLoadingContext>,
    );
    const flushFrames = () => {
      frames.splice(0).forEach((callback) => {
        return callback(0);
      });
    };
    fireEvent.load(view.container.querySelector("img")!);
    act(flushFrames);
    expect(animate).not.toHaveBeenCalled();
    const selected = view.container.querySelector("picture img")!;
    fireEvent.load(selected);
    await act(async () => {
      finishDecode();
    });
    act(flushFrames);
    if (isPreview) {
      expect(animate).not.toHaveBeenCalled();
      view.rerender(
        <MediaLoadingContext value={resources}>
          <PhotoFrame media={makeItemDetail().media} itemId="photo-a" />
        </MediaLoadingContext>,
      );
      act(flushFrames);
    }
    expect(animate).toHaveBeenCalledOnce();
    expect(document.querySelector("[data-photo-flight] img")).toHaveAttribute(
      "src",
      selected.getAttribute("src"),
    );
    view.unmount();
    resources.dispose();
  },
);
