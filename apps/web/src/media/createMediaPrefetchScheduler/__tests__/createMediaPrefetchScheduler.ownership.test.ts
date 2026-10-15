import { describe, expect, it, vi } from "vitest";

import { createMediaPrefetchScheduler } from "../createMediaPrefetchScheduler";

import {
  createPrefetchHarness,
  ENVIRONMENT,
  installCreateMediaPrefetchSchedulerTestLifecycle,
  makePrefetchCandidateFromId,
} from "./createMediaPrefetchSchedulerTestHelpers";
installCreateMediaPrefetchSchedulerTestLifecycle();
describe("bounded media prefetch", () => {
  it("keeps a completed decoded promotion reserved through clear until selected decode releases it", async () => {
    const candidate = makePrefetchCandidateFromId("ready");
    const image = document.createElement("img");
    image.src = candidate.source.url;
    let retained = true;
    const release = vi.fn(() => {
      retained = false;
    });
    const load = vi.fn(async () => {
      return {
        release,
        decodedPhoto: {
          itemId: candidate.itemId,
          source: candidate.source,
          getImage: () => {
            return retained ? image : undefined;
          },
        },
      };
    });
    const scheduler = createMediaPrefetchScheduler({ clock: Date.now, load });
    scheduler.schedule([candidate], ENVIRONMENT);
    await vi.advanceTimersByTimeAsync(250);
    const promotion = scheduler.promote({
      itemId: candidate.itemId,
      source: candidate.source,
    });
    scheduler.clear();
    expect(promotion.decodedPhoto?.getImage()).toBe(image);
    expect(release).not.toHaveBeenCalled();
    scheduler.schedule([makePrefetchCandidateFromId("following")], {
      ...ENVIRONMENT,
      selectionKey: "ready",
    });
    await vi.advanceTimersByTimeAsync(250);
    expect(load).toHaveBeenCalledTimes(1);
    promotion.finishSelectedDecode();
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(2);
    expect(release).toHaveBeenCalledOnce();
    promotion.release();
    scheduler.dispose();
  });
});
describe("bounded media prefetch", () => {
  it("discards reversed queued work but reserves unavoidable transfers until settled", async () => {
    const harness = createPrefetchHarness();
    harness.scheduler.schedule(
      [
        makePrefetchCandidateFromId("old", 0, { byteSize: 7 * 1024 ** 2 }),
        makePrefetchCandidateFromId("old-queued", 1, {
          byteSize: 2 * 1024 ** 2,
        }),
      ],
      ENVIRONMENT,
    );
    await vi.advanceTimersByTimeAsync(250);
    harness.scheduler.schedule(
      [makePrefetchCandidateFromId("reverse", 0, { byteSize: 2 * 1024 ** 2 })],
      { ...ENVIRONMENT, selectionKey: "reversed" },
    );
    expect(harness.starts[0]!.signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(250);
    expect(harness.starts).toHaveLength(1);
    expect(harness.getReservedBytes()).toBe(7 * 1024 ** 2);
    harness.starts[0]!.finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(
      harness.starts.map(({ candidate }) => {
        return candidate.itemId;
      }),
    ).toEqual(["old", "reverse"]);
    expect([...harness.retained]).toEqual([]);
    expect(harness.getMaxReservedBytes()).toBeLessThanOrEqual(8 * 1024 ** 2);
  });
});
describe("bounded media prefetch", () => {
  it("deduplicates a rendition even when its lease URL changes", async () => {
    const { scheduler, starts } = createPrefetchHarness();
    scheduler.schedule(
      [
        makePrefetchCandidateFromId("shared"),
        makePrefetchCandidateFromId("shared", 1, {
          url: "https://bucket.test/renewed",
        }),
      ],
      ENVIRONMENT,
    );
    await vi.advanceTimersByTimeAsync(250);
    scheduler.schedule(
      [
        makePrefetchCandidateFromId("shared", 0, {
          url: "https://bucket.test/newer",
        }),
      ],
      ENVIRONMENT,
    );
    await vi.advanceTimersByTimeAsync(250);
    expect(starts).toHaveLength(1);
    expect(starts[0]!.signal.aborted).toBe(false);
    starts[0]!.finish();
    await vi.advanceTimersByTimeAsync(0);
    scheduler.schedule([makePrefetchCandidateFromId("shared")], ENVIRONMENT);
    await vi.advanceTimersByTimeAsync(250);
    expect(starts).toHaveLength(1);
  });
});
describe("bounded media prefetch", () => {
  it("does not cancel an in-flight candidate promoted to foreground", async () => {
    const { scheduler, starts, retained } = createPrefetchHarness();
    scheduler.schedule(
      [
        makePrefetchCandidateFromId("selected"),
        makePrefetchCandidateFromId("obsolete", 1),
      ],
      ENVIRONMENT,
    );
    await vi.advanceTimersByTimeAsync(250);
    const release = scheduler.promote({
      itemId: "selected",
      source: makePrefetchCandidateFromId("selected").source,
    }).release;
    scheduler.clear();
    expect(starts[0]!.signal.aborted).toBe(false);
    expect(starts[1]!.signal.aborted).toBe(true);
    starts.forEach((operation) => {
      return operation.finish();
    });
    await vi.advanceTimersByTimeAsync(0);
    expect([...retained]).toEqual([]);
    release();
  });
});
describe("bounded media prefetch", () => {
  it("retires foreground adoption while keeping unsettled bytes reserved", async () => {
    const harness = createPrefetchHarness();
    const candidate = makePrefetchCandidateFromId("adopted", 0, {
      byteSize: 8 * 1024 ** 2,
    });
    harness.scheduler.schedule([candidate], ENVIRONMENT);
    await vi.advanceTimersByTimeAsync(250);
    const release = harness.scheduler.promote({
      itemId: "adopted",
      source: makePrefetchCandidateFromId("adopted").source,
    }).release;
    harness.scheduler.clear();
    expect(harness.starts[0]!.signal.aborted).toBe(false);
    release();
    harness.scheduler.clear();
    expect(harness.starts[0]!.signal.aborted).toBe(true);
    expect(harness.getReservedBytes()).toBe(8 * 1024 ** 2);
    harness.scheduler.schedule(
      [makePrefetchCandidateFromId("later")],
      ENVIRONMENT,
    );
    await vi.advanceTimersByTimeAsync(250);
    expect(harness.starts).toHaveLength(1);
    harness.starts[0]!.finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.starts).toHaveLength(2);
    expect(harness.getReservedBytes()).toBe(1024 ** 2);
    expect([...harness.retained]).toEqual([]);
    harness.scheduler.dispose();
    harness.starts[1]!.finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.getReservedBytes()).toBe(0);
  });
});
describe("bounded media prefetch", () => {
  it("releases each foreground owner only once", async () => {
    const { scheduler, starts } = createPrefetchHarness();
    scheduler.schedule([makePrefetchCandidateFromId("adopted")], ENVIRONMENT);
    await vi.advanceTimersByTimeAsync(250);
    const releaseFirst = scheduler.promote({
      itemId: "adopted",
      source: makePrefetchCandidateFromId("adopted").source,
    }).release;
    const releaseSecond = scheduler.promote({
      itemId: "adopted",
      source: makePrefetchCandidateFromId("adopted").source,
    }).release;
    scheduler.clear();
    releaseFirst();
    releaseFirst();
    expect(starts[0]!.signal.aborted).toBe(false);
    releaseSecond();
    expect(starts[0]!.signal.aborted).toBe(true);
    starts[0]!.finish();
    await vi.advanceTimersByTimeAsync(0);
  });
});
describe("bounded media prefetch", () => {
  it("isolates a stale foreground release from a later load of the same rendition", async () => {
    const { scheduler, starts } = createPrefetchHarness();
    scheduler.schedule([makePrefetchCandidateFromId("adopted")], ENVIRONMENT);
    await vi.advanceTimersByTimeAsync(250);
    const releaseOld = scheduler.promote({
      itemId: "adopted",
      source: makePrefetchCandidateFromId("adopted").source,
    }).release;
    scheduler.clear();
    starts[0]!.finish();
    await vi.advanceTimersByTimeAsync(0);
    scheduler.schedule([makePrefetchCandidateFromId("adopted")], ENVIRONMENT);
    await vi.advanceTimersByTimeAsync(250);
    const releaseCurrent = scheduler.promote({
      itemId: "adopted",
      source: makePrefetchCandidateFromId("adopted").source,
    }).release;
    scheduler.clear();
    releaseOld();
    releaseOld();
    expect(starts[1]!.signal.aborted).toBe(false);
    releaseCurrent();
    expect(starts[1]!.signal.aborted).toBe(true);
    starts[1]!.finish();
    await vi.advanceTimersByTimeAsync(0);
  });
});
