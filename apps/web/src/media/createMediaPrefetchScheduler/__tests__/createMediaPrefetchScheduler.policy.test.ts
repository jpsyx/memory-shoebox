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
    scheduler.schedule({
      candidates: [
        makePrefetchCandidateFromId({ id: "behind", rank: 2 }),
        makePrefetchCandidateFromId({ id: "ahead-2", rank: 1 }),
        makePrefetchCandidateFromId({ id: "ahead-1" }),
      ],
      environment: ENVIRONMENT,
    });
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
      return makePrefetchCandidateFromId({
        id: String(rank),
        rank,
        source: {
          byteSize: 4 * 1024 ** 2,
        },
      });
    });
    harness.scheduler.schedule({
      candidates: sources,
      environment: ENVIRONMENT,
    });
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
    scheduler.schedule({
      candidates: [
        makePrefetchCandidateFromId({
          id: "nearest",
          rank: 0,
          source: {
            width: 4096,
            height: 2048,
          },
        }),
        {
          ...makePrefetchCandidateFromId({ id: "second", rank: 1 }),
          decode: true,
        },
      ],
      environment: ENVIRONMENT,
    });
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
    scheduler.schedule({
      candidates: [makePrefetchCandidateFromId({ id: "photo" })],
      environment: {
        ...ENVIRONMENT,
        ...environment,
      },
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(starts).toHaveLength(0);
  });
});
describe("bounded media prefetch", () => {
  it("limits 3G to the immediate photo and posters", async () => {
    const { scheduler, starts } = createPrefetchHarness();
    scheduler.schedule({
      candidates: [
        makePrefetchCandidateFromId({ id: "immediate" }),
        makePrefetchCandidateFromId({ id: "farther", rank: 1 }),
        {
          ...makePrefetchCandidateFromId({ id: "poster", rank: 2 }),
          kind: "poster",
          decode: false,
        },
      ],
      environment: { ...ENVIRONMENT, effectiveType: "3g" },
    });
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
    scheduler.schedule({
      candidates: [
        makePrefetchCandidateFromId({ id: "first" }),
        makePrefetchCandidateFromId({ id: "second", rank: 1 }),
      ],
      environment: {
        ...ENVIRONMENT,
        effectiveType: "unknown",
      },
    });
    await vi.advanceTimersByTimeAsync(250);
    expect(starts).toHaveLength(2);
  });
});
describe("bounded media prefetch", () => {
  it("skips oversized sources and never decodes a photo over 32 MiB", async () => {
    const { scheduler, starts } = createPrefetchHarness();
    scheduler.schedule({
      candidates: [
        makePrefetchCandidateFromId({
          id: "oversized",
          rank: 0,
          source: {
            byteSize: 8 * 1024 ** 2 + 1,
          },
        }),
        makePrefetchCandidateFromId({
          id: "too-many-pixels",
          rank: 1,
          source: {
            width: 8192,
            height: 8192,
          },
        }),
        makePrefetchCandidateFromId({ id: "small", rank: 2 }),
      ],
      environment: ENVIRONMENT,
    });
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
    scheduler.schedule({
      candidates: [
        makePrefetchCandidateFromId({
          id: "expired",
          rank: 0,
          source: {
            expiresAt: new Date(200).toISOString(),
          },
        }),
        {
          ...makePrefetchCandidateFromId({
            id: "original",
            rank: 1,
            source: {
              purpose: "original",
              contentType: "video/mp4",
            },
          }),
          kind: "video-metadata",
        },
        {
          ...makePrefetchCandidateFromId({
            id: "optimized",
            rank: 2,
            source: {
              purpose: "video_mp4",
              contentType: "video/mp4",
            },
          }),
          kind: "video-metadata",
        },
      ],
      environment: ENVIRONMENT,
    });
    await vi.advanceTimersByTimeAsync(250);
    expect(starts).toHaveLength(0);
  });
});
describe("bounded media prefetch", () => {
  it("warms an immediate photo without requesting a decode above 32 MiB", async () => {
    const { scheduler, starts } = createPrefetchHarness();
    scheduler.schedule({
      candidates: [
        makePrefetchCandidateFromId({
          id: "large",
          rank: 0,
          source: { width: 4096, height: 2049 },
        }),
      ],
      environment: ENVIRONMENT,
    });
    await vi.advanceTimersByTimeAsync(250);
    expect(starts).toHaveLength(1);
    expect(starts[0]!.candidate.decode).toBe(false);
  });
});
