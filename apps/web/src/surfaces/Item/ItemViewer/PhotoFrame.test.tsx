import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeItemDetail } from "@/testing/itemFixtureHelpers";
import { makeMediaSource } from "@/surfaces/Timeline/timelineFixtures";
import { PhotoFrame } from "./PhotoFrame";

const media = {
  ...makeItemDetail().media,
  displayCandidates: [480, 960, 2048].map((width) => {
    return makeMediaSource({
      width,
      height: width * 0.75,
      url: `https://example.invalid/${width}.jpg`,
      renditionId: `display-${width}`,
    });
  }),
};

function _deferredDecode() {
  let finish = () => {};
  const promise = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return { promise, finish };
}

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    width: 620,
  } as DOMRect);
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    value: () => {
      return Promise.resolve();
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PhotoFrame", () => {
  it("shows selected thumbnail until matching display decode", async () => {
    const decoded = _deferredDecode();
    vi.spyOn(HTMLImageElement.prototype, "decode").mockReturnValue(
      decoded.promise,
    );
    const { container } = render(<PhotoFrame media={media} itemId="first" />);
    expect(screen.getByRole("img")).toHaveAttribute("src", media.thumb!.url);
    const display = container.querySelector("picture img")!;
    fireEvent.load(display);
    expect(screen.getByRole("img")).toHaveAttribute("src", media.thumb!.url);
    await act(async () => {
      decoded.finish();
      await decoded.promise;
    });
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://example.invalid/960.jpg",
    );
  });
  it("discards a stale DPR decode while the selected item stays the same", async () => {
    const previousDecode = _deferredDecode();
    const currentDecode = _deferredDecode();
    vi.spyOn(HTMLImageElement.prototype, "decode")
      .mockReturnValueOnce(previousDecode.promise)
      .mockReturnValue(currentDecode.promise);
    const { container } = render(<PhotoFrame media={media} itemId="same" />);
    fireEvent.load(container.querySelector("picture img")!);
    vi.stubGlobal("devicePixelRatio", 2);
    fireEvent(window, new Event("resize"));
    fireEvent.load(container.querySelector("picture img")!);
    await act(async () => {
      previousDecode.finish();
      await previousDecode.promise;
    });
    expect(screen.getByRole("img")).toHaveAttribute("src", media.thumb!.url);
    await act(async () => {
      currentDecode.finish();
      await currentDecode.promise;
    });
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://example.invalid/2048.jpg",
    );
  });
  it("discards stale decode on item or DPR change", async () => {
    const oldDecode = _deferredDecode();
    const currentDecode = _deferredDecode();
    vi.spyOn(HTMLImageElement.prototype, "decode")
      .mockReturnValueOnce(oldDecode.promise)
      .mockReturnValue(currentDecode.promise);
    const { container, rerender } = render(
      <PhotoFrame media={media} itemId="first" />,
    );
    fireEvent.load(container.querySelector("picture img")!);
    vi.stubGlobal("devicePixelRatio", 2);
    const changed = {
      ...media,
      thumb: makeMediaSource({
        url: "https://example.invalid/second-thumb.jpg",
      }),
    };
    rerender(<PhotoFrame media={changed} itemId="second" />);
    fireEvent(window, new Event("resize"));
    fireEvent.load(container.querySelector("picture img")!);
    await act(async () => {
      oldDecode.finish();
      await oldDecode.promise;
    });
    expect(screen.getByRole("img")).toHaveAttribute("src", changed.thumb.url);
    await act(async () => {
      currentDecode.finish();
      await currentDecode.promise;
    });
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://example.invalid/2048.jpg",
    );
  });
});
