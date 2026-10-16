import type { MediaLoadingResources } from "./createMediaLoadingResources/createMediaLoadingResources";
import type { Mock } from "vitest";
import type { MediaRef } from "@memory-shoebox/shared";
import type { PhotoViewport } from "./photoViewportHelpers";
import { PhotoFrame } from "@/surfaces/Item/ItemViewer/PhotoFrame/PhotoFrame";
import { makeMediaSource } from "@/surfaces/Timeline/timelineFixtureHelpers";
import { makeItemDetail } from "@/testing/itemFixtureHelpers";
import { act, fireEvent, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createMediaLoadingResources } from "./createMediaLoadingResources/createMediaLoadingResources";
import { createMediaLoadingLifetime } from "./createMediaLoadingResources/createMediaLoadingLifetime";
import { MediaLoadingContext } from "./MediaLoadingContext";

const source = makeMediaSource({
  renditionId: "decoded",
  url: "https://bucket.test/decoded",
  width: 960,
  height: 720,
  expiresAt: "2099-01-01T00:00:00Z",
});
const media = {
  ...makeItemDetail().media,
  display: source,
  displayCandidates: [source],
} satisfies MediaRef;
const VIEWPORT = {
  cssWidth: 620,
  cssHeight: 600,
  devicePixelRatio: 1,
  supportsWebp: true,
} satisfies PhotoViewport;

async function _warm(hasViewport = true): Promise<{
  resources: MediaLoadingResources;
  image: HTMLImageElement;
  release: Mock<() => void>;
}> {
  const image = document.createElement("img");
  image.src = source.url;
  Object.defineProperties(image, {
    naturalWidth: { value: 960 },
    naturalHeight: { value: 720 },
    complete: { value: true },
  });
  let isReleased = false;
  const release = vi.fn(() => {
    isReleased = true;
    image.remove();
    image.removeAttribute("src");
  });
  const resources = createMediaLoadingResources({
    memberId: "member",
    lifetime: createMediaLoadingLifetime(),
    load: async () => {
      return {
        release,
        decodedPhoto: {
          itemId: "target",
          source,
          getImage: () => {
            return isReleased ? undefined : image;
          },
        },
      };
    },
  });
  resources.navigation.viewport = hasViewport ? VIEWPORT : undefined;
  resources.scheduler.schedule({
    candidates: [
      { itemId: "target", source, rank: 0, kind: "photo", decode: true },
    ],
    environment: {
      memberId: "member",
      selectionKey: "before",
      visible: true,
      saveData: false,
      effectiveType: "4g",
    },
  });
  await vi.advanceTimersByTimeAsync(250);
  resources.navigation.prepare({ itemId: "target", source });
  return { resources, image, release };
}

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    value: () => {
      return Promise.resolve();
    },
  });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    width: 620,
    height: 600,
  } as DOMRect);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test("mounts exact warmed pixels without first assigning a thumbnail and waits for the current selected node decode", async () => {
  const { resources, image, release } = await _warm();
  const completion = Promise.withResolvers<void>();
  vi.spyOn(HTMLImageElement.prototype, "decode").mockReturnValue(
    completion.promise,
  );
  const attributes = vi.spyOn(Element.prototype, "setAttribute");
  const view = render(
    <MediaLoadingContext value={resources}>
      <PhotoFrame itemId="target" media={media} />
    </MediaLoadingContext>,
  );
  expect(image.isConnected).toBe(true);
  expect(
    attributes.mock.calls.filter(([name, value]) => {
      return name === "src" && value === media.thumb!.url;
    }),
  ).toEqual([]);
  const frame = view.container.querySelector("[data-photo-ready]")!;
  expect(frame).toHaveAttribute("data-photo-ready", "false");
  const selected = view.container.querySelector("picture img")!;
  expect(selected).not.toBe(image);
  fireEvent.load(selected);
  expect(release).not.toHaveBeenCalled();
  await act(async () => {
    completion.resolve();
    await completion.promise;
  });
  expect(frame).toHaveAttribute("data-photo-ready", "true");
  expect(release).toHaveBeenCalledOnce();
  expect(
    attributes.mock.calls.filter(([name, value]) => {
      return name === "src" && value === media.thumb!.url;
    }),
  ).toEqual([]);
  view.unmount();
  resources.dispose();
});

test("retains pixels across a decoded preview and releases only when the separately mounted detail decodes", async () => {
  const { resources, image, release } = await _warm();
  const completion = Promise.withResolvers<void>();
  vi.spyOn(HTMLImageElement.prototype, "decode")
    .mockResolvedValueOnce(undefined)
    .mockReturnValue(completion.promise);
  const view = render(
    <MediaLoadingContext value={resources}>
      <PhotoFrame
        key="preview"
        itemId="target"
        media={media}
        presentation="preview"
      />
    </MediaLoadingContext>,
  );
  fireEvent.load(view.container.querySelector("picture img")!);
  await act(async () => {});
  expect(release).not.toHaveBeenCalled();
  view.rerender(
    <MediaLoadingContext value={resources}>
      <PhotoFrame key="detail" itemId="target" media={media} />
    </MediaLoadingContext>,
  );
  await act(async () => {});
  expect(image.isConnected).toBe(true);
  expect(view.container.querySelector("[data-photo-ready]")).toHaveAttribute(
    "data-photo-ready",
    "false",
  );
  fireEvent.load(view.container.querySelector("picture img")!);
  await act(async () => {
    completion.resolve();
    await completion.promise;
  });
  expect(release).toHaveBeenCalledOnce();
  view.unmount();
  resources.dispose();
});

(["remove", "clear", "member", "dispose"] as const).forEach((action) => {
  test(`invalidates mounted native handoff synchronously on ${action}`, async () => {
    const { resources, image, release } = await _warm();
    const view = render(
      <MediaLoadingContext value={resources}>
        <PhotoFrame itemId="target" media={media} />
      </MediaLoadingContext>,
    );
    expect(image.isConnected).toBe(true);
    act(() => {
      if (action === "remove") {
        resources.previews.remove("target");
      } else if (action === "clear") {
        resources.previews.clear();
      } else if (action === "member") {
        resources.clearMember();
      } else {
        resources.dispose();
      }
    });
    expect(image.isConnected).toBe(false);
    expect(release).toHaveBeenCalledOnce();
    view.unmount();
    resources.dispose();
  });
});

test("selected source failure releases temporary pixels before waiting for renewal", async () => {
  const { resources, image, release } = await _warm();
  vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}));
  const view = render(
    <MediaLoadingContext value={resources}>
      <PhotoFrame itemId="target" media={media} />
    </MediaLoadingContext>,
  );
  fireEvent.error(view.container.querySelector("picture img")!);
  expect(image.isConnected).toBe(false);
  expect(release).toHaveBeenCalledOnce();
  view.unmount();
  resources.dispose();
});

test("measures an initially unknown viewport without assigning a thumbnail or losing the prepared owner", async () => {
  const { resources, image } = await _warm(false);
  const attributes = vi.spyOn(Element.prototype, "setAttribute");
  const view = render(
    <MediaLoadingContext value={resources}>
      <PhotoFrame itemId="target" media={media} />
    </MediaLoadingContext>,
  );
  expect(image.isConnected).toBe(true);
  expect(
    attributes.mock.calls.filter(([name, value]) => {
      return name === "src" && value === media.thumb!.url;
    }),
  ).toEqual([]);
  view.unmount();
  resources.dispose();
});

test("StrictMode replay preserves the current host and old preview decode cannot finish the detail claim", async () => {
  const { resources, image, release } = await _warm();
  const previewDecode = Promise.withResolvers<void>();
  const detailDecode = Promise.withResolvers<void>();
  vi.spyOn(HTMLImageElement.prototype, "decode")
    .mockReturnValueOnce(previewDecode.promise)
    .mockReturnValue(detailDecode.promise);
  const view = render(
    <StrictMode>
      <MediaLoadingContext value={resources}>
        <PhotoFrame
          key="preview"
          itemId="target"
          media={media}
          presentation="preview"
        />
      </MediaLoadingContext>
    </StrictMode>,
  );
  fireEvent.load(view.container.querySelector("picture img")!);
  view.rerender(
    <StrictMode>
      <MediaLoadingContext value={resources}>
        <PhotoFrame key="detail" itemId="target" media={media} />
      </MediaLoadingContext>
    </StrictMode>,
  );
  await act(async () => {
    previewDecode.resolve();
    await previewDecode.promise;
  });
  expect(image.isConnected).toBe(true);
  expect(release).not.toHaveBeenCalled();
  expect(view.container.querySelector("[data-photo-ready]")).toHaveAttribute(
    "data-photo-ready",
    "false",
  );
  fireEvent.load(view.container.querySelector("picture img")!);
  await act(async () => {
    detailDecode.resolve();
    await detailDecode.promise;
  });
  expect(release).toHaveBeenCalledOnce();
  view.unmount();
  resources.dispose();
});

test("a same-source DPR change drops temporary pixels and keeps current-node decode authoritative", async () => {
  const { resources, image, release } = await _warm();
  const view = render(
    <MediaLoadingContext value={resources}>
      <PhotoFrame itemId="target" media={media} />
    </MediaLoadingContext>,
  );
  vi.stubGlobal("devicePixelRatio", 2);
  fireEvent(window, new Event("resize"));
  expect(image.isConnected).toBe(false);
  expect(release).toHaveBeenCalledOnce();
  expect(view.container.querySelector("[data-photo-ready]")).toHaveAttribute(
    "data-photo-ready",
    "false",
  );
  view.unmount();
  resources.dispose();
  vi.unstubAllGlobals();
});
