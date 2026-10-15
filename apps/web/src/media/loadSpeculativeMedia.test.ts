import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSpeculativeMedia } from "./loadSpeculativeMedia";
import type { PrefetchCandidate } from "./mediaPrefetch.types";

const CANDIDATE: PrefetchCandidate = {
  itemId: "photo",
  rank: 0,
  kind: "photo",
  decode: true,
  source: {
    renditionId: "display",
    purpose: "display",
    contentType: "image/jpeg",
    url: "https://bucket.test/exact?signature=unchanged",
    byteSize: 1000,
    width: 960,
    height: 640,
    issuedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-01T01:00:00.000Z",
  },
};

function _nativeImage() {
  const image = document.createElement("img");
  const decode = vi.fn().mockResolvedValue(undefined);
  image.decode = decode;
  vi.stubGlobal(
    "Image",
    vi.fn(function () {
      return image;
    }),
  );
  return { image, decode };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("native speculative image", () => {
  it("exposes only the exact successfully decoded native photo until release", async () => {
    const { image, decode } = _nativeImage();
    const completion = Promise.withResolvers<void>();
    decode.mockReturnValue(completion.promise);
    Object.defineProperty(image, "naturalWidth", { value: 960 });
    Object.defineProperty(image, "naturalHeight", { value: 640 });
    const candidate = {
      ...CANDIDATE,
      source: { ...CANDIDATE.source, expiresAt: "2099-01-01T00:00:00Z" },
    };
    const pending = loadSpeculativeMedia(
      candidate,
      new AbortController().signal,
    );
    image.dispatchEvent(new Event("load"));
    completion.resolve();
    const media = await pending;
    expect(media.decodedPhoto?.itemId).toBe(candidate.itemId);
    expect(media.decodedPhoto?.source).toEqual(candidate.source);
    expect(media.decodedPhoto?.getImage()).toBe(image);
    media.release();
    expect(media.decodedPhoto?.getImage()).toBeUndefined();
    expect(image.hasAttribute("src")).toBe(false);
  });
  it("uses the exact later-rendered URL and default CORS/referrer mode", async () => {
    const { image, decode } = _nativeImage();
    const pending = loadSpeculativeMedia(
      CANDIDATE,
      new AbortController().signal,
    );
    expect(image.src).toBe(CANDIDATE.source.url);
    expect(image.hasAttribute("crossorigin")).toBe(false);
    expect(image.hasAttribute("referrerpolicy")).toBe(false);
    image.dispatchEvent(new Event("load"));
    const media = await pending;
    expect(decode).toHaveBeenCalledOnce();
    expect(image.src).toBe(CANDIDATE.source.url);
    media.release();
    expect(image.hasAttribute("src")).toBe(false);
  });

  it("keeps an aborted native transfer unsettled until its load event", async () => {
    const { image, decode } = _nativeImage();
    const controller = new AbortController();
    let settled = false;
    const pending = loadSpeculativeMedia(CANDIDATE, controller.signal).finally(
      () => {
        settled = true;
      },
    );
    const rejected = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(image.src).toBe(CANDIDATE.source.url);
    image.dispatchEvent(new Event("load"));
    await rejected;
    expect(decode).not.toHaveBeenCalled();
    expect(image.hasAttribute("src")).toBe(false);
  });

  it("releases a native image on error without decoding", async () => {
    const { image, decode } = _nativeImage();
    const pending = loadSpeculativeMedia(
      CANDIDATE,
      new AbortController().signal,
    );
    const rejected = expect(pending).rejects.toThrow();
    image.dispatchEvent(new Event("error"));
    await rejected;
    expect(decode).not.toHaveBeenCalled();
    expect(image.hasAttribute("src")).toBe(false);
  });

  it("waits for an already-started decode after abort and releases its result", async () => {
    const { image, decode } = _nativeImage();
    let finishDecode = () => {};
    decode.mockImplementation(() => {
      return new Promise<void>((resolve) => {
        finishDecode = resolve;
      });
    });
    const controller = new AbortController();
    let settled = false;
    const pending = loadSpeculativeMedia(CANDIDATE, controller.signal).finally(
      () => {
        settled = true;
      },
    );
    const rejected = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    image.dispatchEvent(new Event("load"));
    controller.abort();
    await Promise.resolve();
    expect(settled).toBe(false);
    finishDecode();
    await rejected;
    expect(image.hasAttribute("src")).toBe(false);
  });

  it("does not explicitly decode posters or distant photos", async () => {
    const { image, decode } = _nativeImage();
    const pending = loadSpeculativeMedia(
      { ...CANDIDATE, decode: false },
      new AbortController().signal,
    );
    image.dispatchEvent(new Event("load"));
    const media = await pending;
    expect(decode).not.toHaveBeenCalled();
    media.release();
    expect(image.hasAttribute("src")).toBe(false);
  });

  it("refuses metadata and already-aborted loads without allocating an image", async () => {
    _nativeImage();
    await expect(
      loadSpeculativeMedia(
        { ...CANDIDATE, kind: "video-metadata" },
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    await expect(
      loadSpeculativeMedia(CANDIDATE, AbortSignal.abort()),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(Image).not.toHaveBeenCalled();
  });
});
