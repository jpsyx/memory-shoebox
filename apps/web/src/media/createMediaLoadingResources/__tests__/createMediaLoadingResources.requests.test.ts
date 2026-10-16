import type { SpeculativeMedia } from "../../mediaPrefetch.types";
import { describe, expect, it, vi } from "vitest";
import { createMediaLoadingResources } from "../createMediaLoadingResources";
import { createMediaLoadingLifetime } from "../createMediaLoadingLifetime";
import {
  ITEM_ID,
  SECOND_ID,
  PREVIEW,
  REQUEST,
  ENVIRONMENT,
  makePrefetchCandidateFromId as _candidate,
  stubMediaPreviewReads as _reads,
  installMediaLoadingTestTimers,
} from "./createMediaLoadingResourcesTestHelpers";

installMediaLoadingTestTimers();

describe("member media resources", () => {
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
    resources.scheduler.schedule({
      candidates: [_candidate()],
      environment: ENVIRONMENT,
    });
    await vi.advanceTimersByTimeAsync(250);
    const first = resources.readPreviews({ request: REQUEST });
    const second = resources.readPreviews({
      request: { ...REQUEST, itemIds: [SECOND_ID] },
    });
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
    resources.previews.put({ previews: [PREVIEW] });
    const late = resources.readPreviews({
      request: { ...REQUEST, itemIds: [SECOND_ID] },
    });
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
    first.previews.put({ previews: [PREVIEW] });
    first.scheduler.schedule({
      candidates: [_candidate("old")],
      environment: ENVIRONMENT,
    });
    await vi.advanceTimersByTimeAsync(250);
    const late = first.readPreviews({ request: REQUEST });
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
    second.scheduler.schedule({
      candidates: [_candidate("new")],
      environment: {
        ...ENVIRONMENT,
        memberId: "second",
      },
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
    const first = resources.readPreviews({ request: REQUEST });
    const second = resources.readPreviews({ request: REQUEST });
    await vi.advanceTimersByTimeAsync(0);
    const foreground = resources.readPreviews({
      request: {
        ...REQUEST,
        purpose: "selected-view",
      },
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
    await expect(
      resources.readPreviews({ request: REQUEST }),
    ).rejects.toMatchObject({
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
      resources.readPreviews({ request: REQUEST }),
      resources.readPreviews({ request: REQUEST }),
    ];
    const candidate = _candidate();
    candidate.source.expiresAt = new Date(500).toISOString();
    resources.scheduler.schedule({
      candidates: [candidate],
      environment: ENVIRONMENT,
    });
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
    const first = resources.readPreviews({ request: REQUEST });
    const second = resources.readPreviews({ request: REQUEST });
    await vi.advanceTimersByTimeAsync(0);
    const foreground = resources.readPreviews({
      request: REQUEST,
      priority: "foreground",
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(requests).toHaveLength(3);
    requests.forEach((request) => {
      request.finish({ items: [PREVIEW] });
    });
    await Promise.all([first, second, foreground]);
    resources.dispose();
  });
});
