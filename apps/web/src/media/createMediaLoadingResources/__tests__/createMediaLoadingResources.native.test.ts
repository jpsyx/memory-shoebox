import type { Mock } from "vitest";
import { describe, expect, it, vi } from "vitest";
import { createMediaLoadingResources } from "../createMediaLoadingResources";
import { createMediaLoadingLifetime } from "../createMediaLoadingLifetime";
import {
  REQUEST,
  ENVIRONMENT,
  makePrefetchCandidateFromId as _candidate,
  stubMediaPreviewReads as _reads,
  installMediaLoadingTestTimers,
} from "./createMediaLoadingResourcesTestHelpers";

function _nativeImages(): {
  images: HTMLImageElement[];
  decode: Mock<HTMLImageElement["decode"]>;
} {
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

installMediaLoadingTestTimers();

describe("member media resources", () => {
  it("suppresses native decode after the adopting foreground view exits", async () => {
    const { images, decode } = _nativeImages();
    const resources = createMediaLoadingResources({
      memberId: "first",
      lifetime: createMediaLoadingLifetime(),
    });
    resources.scheduler.schedule({
      candidates: [_candidate("adopted")],
      environment: ENVIRONMENT,
    });
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
    resources.scheduler.schedule({
      candidates: [_candidate("later")],
      environment: ENVIRONMENT,
    });
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
      resources.readPreviews({ request: REQUEST }),
      resources.readPreviews({ request: REQUEST }),
    ];
    const settledReads = Promise.allSettled(reads);
    resources.scheduler.schedule({
      candidates: [_candidate("adopted")],
      environment: ENVIRONMENT,
    });
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
      resources.readPreviews({ request: REQUEST }),
      resources.readPreviews({ request: REQUEST }),
    ];
    const settledReads = Promise.allSettled(reads);
    resources.scheduler.schedule({
      candidates: [_candidate("adopted")],
      environment: ENVIRONMENT,
    });
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
});
