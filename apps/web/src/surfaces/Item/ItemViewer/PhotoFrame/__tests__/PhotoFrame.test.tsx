import type { MediaRef } from "@memory-shoebox/shared";
import { MediaLoadingContext } from "@/media/MediaLoadingContext";
import { PhotoReadinessContext } from "@/media/PhotoReadinessContext";
import { createMediaLoadingResources } from "@/media/createMediaLoadingResources/createMediaLoadingResources";
import { createMediaLoadingLifetime } from "@/media/createMediaLoadingResources/createMediaLoadingLifetime";
import { makeMediaSource } from "@/surfaces/Timeline/timelineFixtureHelpers";
import { makeItemDetail } from "@/testing/itemFixtureHelpers";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeMediaRefFromSources } from "../../../../../../../server/src/archive/makeMediaRefFromSources";
import { PhotoFrame } from "../PhotoFrame";

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
} satisfies MediaRef;

function _deferredDecode(): { promise: Promise<void>; finish: () => void } {
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

it("renews a failed photo once and offers explicit retry after its renewed source fails", async () => {
  const resources = createMediaLoadingResources({
    memberId: "first",
    lifetime: createMediaLoadingLifetime(),
  });
  const renewed = {
    ...media,
    displayCandidates: media.displayCandidates.map((source) => {
      return {
        ...source,
        url: `${source.url}?renewed=1`,
      };
    }),
  };
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        items: [
          {
            itemId: "018f0000-0000-7000-8000-00000000f001",
            kind: "photo",
            width: media.width,
            height: media.height,
            media: renewed,
          },
        ],
      }),
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  const view = render(
    <MediaLoadingContext value={resources}>
      <PhotoFrame media={media} itemId="018f0000-0000-7000-8000-00000000f001" />
    </MediaLoadingContext>,
  );
  fireEvent.error(view.container.querySelector("picture img")!);
  await waitFor(() => {
    return expect(fetcher).toHaveBeenCalledOnce();
  });
  await waitFor(() => {
    return expect(view.container.querySelector("picture img")).toHaveAttribute(
      "src",
      "https://example.invalid/960.jpg?renewed=1",
    );
  });
  fireEvent.error(view.container.querySelector("picture img")!);
  expect(
    await screen.findByRole("button", { name: "Try loading photo again" }),
  ).toBeVisible();
  expect(fetcher).toHaveBeenCalledOnce();
  view.unmount();
  resources.dispose();
});
it("removes retained decoded pixels when renewal denies access", async () => {
  const resources = createMediaLoadingResources({
    memberId: "first",
    lifetime: createMediaLoadingLifetime(),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }))),
  );
  const view = render(
    <MediaLoadingContext value={resources}>
      <PhotoFrame media={media} itemId="018f0000-0000-7000-8000-00000000f001" />
    </MediaLoadingContext>,
  );
  await act(async () => {
    return fireEvent.load(view.container.querySelector("picture img")!);
  });
  expect(
    view.container.querySelector('[data-photo-ready="true"]'),
  ).not.toBeNull();
  fireEvent.error(view.container.querySelector("picture img")!);
  await waitFor(() => {
    return expect(view.container.querySelector("img")).toBeNull();
  });
  view.unmount();
  resources.dispose();
});

it.each([
  { width: 900, height: 600 },
  { width: 320, height: 240 },
])(
  "decodes a server-selected original PNG at $width px and opens neighbor readiness",
  async ({ width, height }) => {
    const original = makeMediaSource({
      width,
      height,
      byteSize: 4096,
      contentType: "image/png",
      purpose: "original",
      renditionId: "png-original",
      url: "https://example.invalid/original.png",
    });
    const produced = makeMediaRefFromSources({
      sources: new Map([["original", original]]),
      kind: "photo",
      width,
      height,
      previewState: "unavailable",
      durationMs: undefined,
      altText: "An original PNG",
    });
    expect(produced.thumb).toEqual(width > 480 ? null : original);
    expect(produced.displayCandidates).toEqual([original]);
    const readiness = vi.fn();
    const decoded = _deferredDecode();
    vi.spyOn(HTMLImageElement.prototype, "decode").mockReturnValue(
      decoded.promise,
    );
    const view = render(
      <PhotoReadinessContext value={readiness}>
        <PhotoFrame itemId="original-png" media={produced} />
      </PhotoReadinessContext>,
    );
    const selected = view.container.querySelector("picture img");
    expect(selected).not.toBeNull();
    expect(readiness).not.toHaveBeenCalledWith(
      expect.objectContaining({ photosReady: true }),
    );
    fireEvent.load(selected!);
    expect(view.container.querySelector("[data-photo-ready]")).toHaveAttribute(
      "data-photo-ready",
      "false",
    );
    await act(async () => {
      decoded.finish();
      await decoded.promise;
    });
    expect(screen.getByRole("img", { name: "An original PNG" })).toBeVisible();
    expect(
      screen.getByRole("img", { name: "An original PNG" }),
    ).toHaveAttribute("src", original.url);
    expect(view.container.querySelector("[data-photo-ready]")).toHaveAttribute(
      "data-photo-ready",
      "true",
    );
    expect(readiness).toHaveBeenLastCalledWith(
      expect.objectContaining({ itemId: "original-png", photosReady: true }),
    );
  },
);
