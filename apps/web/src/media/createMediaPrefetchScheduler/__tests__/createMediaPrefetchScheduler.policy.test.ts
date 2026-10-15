import { describe, expect, it, vi } from "vitest";

import {
  createPrefetchHarness,
  ENVIRONMENT,
  installCreateMediaPrefetchSchedulerTestLifecycle,
  makePrefetchCandidateFromId,
} from "./createMediaPrefetchSchedulerTestHelpers";
installCreateMediaPrefetchSchedulerTestLifecycle();
describe("bounded media prefetch", () => {
  it("starts two ahead and one behind after 250 ms", async () => {
    const { scheduler, starts } = createPrefetchHarness();
    scheduler.schedule(
      [
        makePrefetchCandidateFromId("behind", 2),
        makePrefetchCandidateFromId("ahead-2", 1),
        makePrefetchCandidateFromId("ahead-1"),
      ],
      ENVIRONMENT,
    );
    await vi.advanceTimersByTimeAsync(249);
    expect(starts).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(
      starts.map(({ candidate }) => {
        return candidate.itemId;
      }),
    ).toEqual(["ahead-1", "ahead-2"]);
    starts[1]!.finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(
      starts.map(({ candidate }) => {
        return candidate.itemId;
      }),
    ).toEqual(["ahead-1", "ahead-2", "behind"]);
  });
});
describe("bounded media prefetch", () => {
  it("never exceeds two operations or 8 MiB", async () => {
    const harness = createPrefetchHarness();
    const sources = [0, 1, 2].map((rank) => {
      return makePrefetchCandidateFromId(String(rank), rank, {
        byteSize: 4 * 1024 ** 2,
      });
    });
    harness.scheduler.schedule(sources, ENVIRONMENT);
    await vi.advanceTimersByTimeAsync(250);
    expect(harness.starts).toHaveLength(2);
    harness.starts[0]!.finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.starts).toHaveLength(2);
    harness.starts[1]!.finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.starts).toHaveLength(3);
    expect(harness.getMaxActive()).toBeLessThanOrEqual(2);
    expect(harness.getMaxReservedBytes()).toBeLessThanOrEqual(8 * 1024 ** 2);
  });
});
describe("bounded media prefetch", () => {
  it("decodes only the nearest photo within 32 MiB", async () => {
    const { scheduler, starts, retained } = createPrefetchHarness();
    scheduler.schedule(
      [
        makePrefetchCandidateFromId("nearest", 0, {
          width: 4096,
          height: 2048,
        }),
        { ...makePrefetchCandidateFromId("second", 1), decode: true },
      ],
      ENVIRONMENT,
    );
    await vi.advanceTimersByTimeAsync(250);
    expect(
      starts.map(({ candidate }) => {
        return candidate.decode;
      }),
    ).toEqual([true, false]);
    starts.forEach((operation) => {
      return operation.finish();
    });
    await vi.advanceTimersByTimeAsync(0);
    expect([...retained]).toEqual(["nearest"]);
    scheduler.clear();
    expect([...retained]).toEqual([]);
  });
});
describe("bounded media prefetch", () => {
  it.each([
    { saveData: true },
    { effectiveType: "slow-2g" as const },
    { effectiveType: "2g" as const },
    { visible: false },
  ])("disables speculation for %j", async (environment) => {
    const { scheduler, starts } = createPrefetchHarness();
    scheduler.schedule([makePrefetchCandidateFromId("photo")], {
      ...ENVIRONMENT,
      ...environment,
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(starts).toHaveLength(0);
  });
});
describe("bounded media prefetch", () => {
  it("limits 3G to the immediate photo and posters", async () => {
    const { scheduler, starts } = createPrefetchHarness();
    scheduler.schedule(
      [
        makePrefetchCandidateFromId("immediate"),
        makePrefetchCandidateFromId("farther", 1),
        {
          ...makePrefetchCandidateFromId("poster", 2),
          kind: "poster",
          decode: false,
        },
      ],
      { ...ENVIRONMENT, effectiveType: "3g" },
    );
    await vi.advanceTimersByTimeAsync(250);
    expect(
      starts.map(({ candidate }) => {
        return candidate.itemId;
      }),
    ).toEqual(["immediate", "poster"]);
  });
});
describe("bounded media prefetch", () => {
  it("uses the bounded policy when the connection API is unknown", async () => {
    const { scheduler, starts } = createPrefetchHarness();
    scheduler.schedule(
      [
        makePrefetchCandidateFromId("first"),
        makePrefetchCandidateFromId("second", 1),
      ],
      {
        ...ENVIRONMENT,
        effectiveType: "unknown",
      },
    );
    await vi.advanceTimersByTimeAsync(250);
    expect(starts).toHaveLength(2);
  });
});
describe("bounded media prefetch", () => {
  it("skips oversized sources and never decodes a photo over 32 MiB", async () => {
    const { scheduler, starts } = createPrefetchHarness();
    scheduler.schedule(
      [
        makePrefetchCandidateFromId("oversized", 0, {
          byteSize: 8 * 1024 ** 2 + 1,
        }),
        makePrefetchCandidateFromId("too-many-pixels", 1, {
          width: 8192,
          height: 8192,
        }),
        makePrefetchCandidateFromId("small", 2),
      ],
      ENVIRONMENT,
    );
    await vi.advanceTimersByTimeAsync(250);
    expect(
      starts.map(({ candidate }) => {
        return [candidate.itemId, candidate.decode];
      }),
    ).toEqual([
      ["too-many-pixels", false],
      ["small", false],
    ]);
  });
});
describe("bounded media prefetch", () => {
  it("rejects expired leases and all video metadata while measurement-gated", async () => {
    const { scheduler, starts } = createPrefetchHarness();
    scheduler.schedule(
      [
        makePrefetchCandidateFromId("expired", 0, {
          expiresAt: new Date(200).toISOString(),
        }),
        {
          ...makePrefetchCandidateFromId("original", 1, {
            purpose: "original",
            contentType: "video/mp4",
          }),
          kind: "video-metadata",
        },
        {
          ...makePrefetchCandidateFromId("optimized", 2, {
            purpose: "video_mp4",
            contentType: "video/mp4",
          }),
          kind: "video-metadata",
        },
      ],
      ENVIRONMENT,
    );
    await vi.advanceTimersByTimeAsync(250);
    expect(starts).toHaveLength(0);
  });
});
describe("bounded media prefetch", () => {
  it("warms an immediate photo without requesting a decode above 32 MiB", async () => {
    const { scheduler, starts } = createPrefetchHarness();
    scheduler.schedule(
      [makePrefetchCandidateFromId("large", 0, { width: 4096, height: 2049 })],
      ENVIRONMENT,
    );
    await vi.advanceTimersByTimeAsync(250);
    expect(starts).toHaveLength(1);
    expect(starts[0]!.candidate.decode).toBe(false);
  });
});
