import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeItemDetail } from "@/testing/itemFixtureHelpers";
import {
  createMediaLoadingLifetime,
  createMediaLoadingResources,
} from "./createMediaLoadingResources";
import type {
  PrefetchCandidate,
  SpeculativeMedia,
} from "./mediaPrefetch.types";

const ITEM_ID: string = "10000000-0000-4000-8000-000000000001";
const SECOND_ID: string = "10000000-0000-4000-8000-000000000002";
const DETAIL = makeItemDetail({ itemId: ITEM_ID });
const PREVIEW = {
  itemId: ITEM_ID,
  kind: DETAIL.kind,
  width: DETAIL.media.width,
  height: DETAIL.media.height,
  media: DETAIL.media,
};
const REQUEST = { itemIds: [ITEM_ID], purpose: "speculative-preview" as const };
const ENVIRONMENT = {
  memberId: "first",
  selectionKey: "photo",
  visible: true,
  saveData: false,
  effectiveType: "4g" as const,
};

function _candidate(id = "source"): PrefetchCandidate {
  return {
    itemId: id,
    rank: 0,
    kind: "photo",
    decode: true,
    source: {
      ...DETAIL.media.display!,
      renditionId: id,
      byteSize: 8 * 1024 ** 2,
      issuedAt: new Date(0).toISOString(),
      expiresAt: new Date(3600000).toISOString(),
    },
  };
}

function _reads() {
  const requests: Array<{
    signal: AbortSignal;
    finish: (body: unknown) => void;
  }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((_path: string, init: RequestInit) => {
      return new Promise<Response>((resolve) => {
        requests.push({
          signal: init.signal!,
          finish: (body) => {
            return resolve(
              new Response(JSON.stringify(body), {
                headers: { "content-type": "application/json" },
              }),
            );
          },
        });
      });
    }),
  );
  return requests;
}

function _nativeImages() {
  const images: HTMLImageElement[] = [];
  const decode = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal(
    "Image",
    vi.fn(function () {
      const image = document.createElement("img");
      image.decode = decode;
      images.push(image);
      return image;
    }),
  );
  return { images, decode };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("member media resources", () => {
  it("suppresses native decode after the adopting foreground view exits", async () => {
    const { images, decode } = _nativeImages();
    const resources = createMediaLoadingResources({
      memberId: "first",
      lifetime: createMediaLoadingLifetime(),
    });
    resources.scheduler.schedule([_candidate("adopted")], ENVIRONMENT);
    await vi.advanceTimersByTimeAsync(250);
    expect(images).toHaveLength(1);
    const release = resources.scheduler.promote({
      itemId: "adopted",
      source: _candidate("adopted").source,
    }).release;
    resources.clearWork();
    expect(images[0]!.hasAttribute("src")).toBe(true);
    release();
    resources.clearWork();
    resources.scheduler.schedule([_candidate("later")], ENVIRONMENT);
    await vi.advanceTimersByTimeAsync(250);
    expect(images).toHaveLength(1);
    expect(images[0]!.hasAttribute("src")).toBe(true);
    images[0]!.dispatchEvent(new Event("load"));
    await vi.advanceTimersByTimeAsync(0);
    expect(decode).not.toHaveBeenCalled();
    expect(images[0]!.hasAttribute("src")).toBe(false);
    expect(images).toHaveLength(2);
    resources.dispose();
    images[1]!.dispatchEvent(new Event("load"));
    await vi.advanceTimersByTimeAsync(0);
  });

  it("cancels an adopted native image queued behind API slots when its view exits", async () => {
    const requests = _reads();
    const { images, decode } = _nativeImages();
    const resources = createMediaLoadingResources({
      memberId: "first",
      lifetime: createMediaLoadingLifetime(),
    });
    const reads = [
      resources.readPreviews(REQUEST),
      resources.readPreviews(REQUEST),
    ];
    const settledReads = Promise.allSettled(reads);
    resources.scheduler.schedule([_candidate("adopted")], ENVIRONMENT);
    await vi.advanceTimersByTimeAsync(250);
    expect(requests).toHaveLength(2);
    expect(images).toHaveLength(0);
    const release = resources.scheduler.promote({
      itemId: "adopted",
      source: _candidate("adopted").source,
    }).release;
    resources.clearWork();
    release();
    resources.clearWork();
    requests.forEach((request) => {
      request.finish({ items: [] });
    });
    await settledReads;
    await vi.advanceTimersByTimeAsync(0);
    expect(images).toHaveLength(0);
    expect(decode).not.toHaveBeenCalled();
    resources.dispose();
  });

  it("continues an adopted native image through route cleanup while its owner is live", async () => {
    const requests = _reads();
    const { images, decode } = _nativeImages();
    const resources = createMediaLoadingResources({
      memberId: "first",
      lifetime: createMediaLoadingLifetime(),
    });
    const reads = [
      resources.readPreviews(REQUEST),
      resources.readPreviews(REQUEST),
    ];
    const settledReads = Promise.allSettled(reads);
    resources.scheduler.schedule([_candidate("adopted")], ENVIRONMENT);
    await vi.advanceTimersByTimeAsync(250);
    expect(images).toHaveLength(0);
    const release = resources.scheduler.promote({
      itemId: "adopted",
      source: _candidate("adopted").source,
    }).release;
    resources.clearWork();
    requests.forEach((request) => {
      request.finish({ items: [] });
    });
    await settledReads;
    await vi.advanceTimersByTimeAsync(0);
    expect(images).toHaveLength(1);
    images[0]!.dispatchEvent(new Event("load"));
    await vi.advanceTimersByTimeAsync(0);
    expect(decode).toHaveBeenCalledOnce();
    expect(images[0]!.hasAttribute("src")).toBe(false);
    release();
    resources.dispose();
  });

  it("prevents a third speculative operation when API reads overlap native loads", async () => {
    const requests = _reads();
    let finishImage: (value: SpeculativeMedia) => void = () => {};
    let imagesStarted = 0;
    const resources = createMediaLoadingResources({
      memberId: "first",
      lifetime: createMediaLoadingLifetime(),
      load: () => {
        imagesStarted += 1;
        return new Promise<SpeculativeMedia>((resolve) => {
          finishImage = resolve;
        });
      },
    });
    resources.scheduler.schedule([_candidate()], ENVIRONMENT);
    await vi.advanceTimersByTimeAsync(250);
    const first = resources.readPreviews(REQUEST);
    const second = resources.readPreviews({ ...REQUEST, itemIds: [SECOND_ID] });
    await vi.advanceTimersByTimeAsync(0);
    expect(imagesStarted).toBe(1);
    expect(requests).toHaveLength(1);
    requests[0]!.finish({ items: [PREVIEW] });
    await first;
    await vi.advanceTimersByTimeAsync(0);
    expect(requests).toHaveLength(2);
    requests[1]!.finish({ items: [] });
    await second;
    finishImage({ release: () => {} });
    await vi.advanceTimersByTimeAsync(0);
    resources.dispose();
  });

  it("retains warmed route entries but suppresses an aborted late route response", async () => {
    const requests = _reads();
    const resources = createMediaLoadingResources({
      memberId: "first",
      lifetime: createMediaLoadingLifetime(),
    });
    resources.previews.put([PREVIEW]);
    const late = resources.readPreviews({ ...REQUEST, itemIds: [SECOND_ID] });
    const rejection = expect(late).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.advanceTimersByTimeAsync(0);
    resources.clearWork();
    expect(requests[0]!.signal.aborted).toBe(true);
    requests[0]!.finish({ items: [{ ...PREVIEW, itemId: SECOND_ID }] });
    await rejection;
    expect(resources.previews.read(ITEM_ID)).toEqual(PREVIEW);
    expect(resources.previews.read(SECOND_ID)).toBeUndefined();
    resources.dispose();
  });

  it("holds replacement speculation until old native loads settle without sharing member metadata", async () => {
    const requests = _reads();
    const lifetime = createMediaLoadingLifetime();
    let finishOld: (value: SpeculativeMedia) => void = () => {};
    const releaseOld = vi.fn();
    const first = createMediaLoadingResources({
      memberId: "first",
      lifetime,
      load: () => {
        return new Promise((resolve) => {
          finishOld = resolve;
        });
      },
    });
    first.previews.put([PREVIEW]);
    first.scheduler.schedule([_candidate("old")], ENVIRONMENT);
    await vi.advanceTimersByTimeAsync(250);
    const late = first.readPreviews(REQUEST);
    const rejected = expect(late).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(0);
    first.dispose();
    expect(first.previews.read(ITEM_ID)).toBeUndefined();
    let secondStarts = 0;
    const second = createMediaLoadingResources({
      memberId: "second",
      lifetime,
      load: async () => {
        secondStarts += 1;
        return { release: () => {} };
      },
    });
    second.scheduler.schedule([_candidate("new")], {
      ...ENVIRONMENT,
      memberId: "second",
    });
    await vi.advanceTimersByTimeAsync(250);
    expect(secondStarts).toBe(0);
    requests[0]!.finish({ items: [PREVIEW] });
    await rejected;
    expect(first.previews.read(ITEM_ID)).toBeUndefined();
    expect(second.previews.read(ITEM_ID)).toBeUndefined();
    expect(secondStarts).toBe(0);
    finishOld({ release: releaseOld });
    await vi.advanceTimersByTimeAsync(0);
    expect(secondStarts).toBe(1);
    expect(releaseOld).toHaveBeenCalledOnce();
    second.dispose();
  });

  it("never blocks selected-view foreground reads behind speculation", async () => {
    const requests = _reads();
    const resources = createMediaLoadingResources({
      memberId: "first",
      lifetime: createMediaLoadingLifetime(),
    });
    const first = resources.readPreviews(REQUEST);
    const second = resources.readPreviews(REQUEST);
    await vi.advanceTimersByTimeAsync(0);
    const foreground = resources.readPreviews({
      ...REQUEST,
      purpose: "selected-view",
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(requests).toHaveLength(3);
    requests.forEach((request) => {
      return request.finish({ items: [PREVIEW] });
    });
    await Promise.all([first, second, foreground]);
    expect(resources.previews.read(ITEM_ID)).toEqual(PREVIEW);
    resources.dispose();
  });

  it("stores safe neighbors with an epoch and rejects reads after disposal", async () => {
    const requests = _reads();
    const resources = createMediaLoadingResources({
      memberId: "first",
      lifetime: createMediaLoadingLifetime(),
    });
    const response = resources.readNeighbors({
      itemId: ITEM_ID,
      direction: "next",
      selection: { tags: [], people: [] },
    });
    await vi.advanceTimersByTimeAsync(0);
    requests[0]!.finish({ ahead: [PREVIEW], behind: [] });
    await response;
    expect(resources.previews.read(ITEM_ID)).toEqual(PREVIEW);
    resources.dispose();
    await expect(resources.readPreviews(REQUEST)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(requests).toHaveLength(1);
  });
  it("does not start an expired image after waiting for API operation slots", async () => {
    const requests = _reads();
    let imagesStarted = 0;
    const resources = createMediaLoadingResources({
      memberId: "first",
      lifetime: createMediaLoadingLifetime(),
      load: async () => {
        imagesStarted += 1;
        return { release: () => {} };
      },
    });
    const reads = [
      resources.readPreviews(REQUEST),
      resources.readPreviews(REQUEST),
    ];
    const candidate = _candidate();
    candidate.source.expiresAt = new Date(500).toISOString();
    resources.scheduler.schedule([candidate], ENVIRONMENT);
    await vi.advanceTimersByTimeAsync(1000);
    requests.forEach((request) => {
      request.finish({ items: [] });
    });
    await Promise.all(reads);
    await vi.advanceTimersByTimeAsync(0);
    expect(imagesStarted).toBe(0);
    resources.dispose();
  });
  it("allows foreground economical previews through occupied speculative slots", async () => {
    const requests = _reads();
    const resources = createMediaLoadingResources({
      memberId: "first",
      lifetime: createMediaLoadingLifetime(),
    });
    const first = resources.readPreviews(REQUEST);
    const second = resources.readPreviews(REQUEST);
    await vi.advanceTimersByTimeAsync(0);
    const foreground = resources.readPreviews(REQUEST, "foreground");
    await vi.advanceTimersByTimeAsync(0);
    expect(requests).toHaveLength(3);
    requests.forEach((request) => {
      request.finish({ items: [PREVIEW] });
    });
    await Promise.all([first, second, foreground]);
    resources.dispose();
  });
});
