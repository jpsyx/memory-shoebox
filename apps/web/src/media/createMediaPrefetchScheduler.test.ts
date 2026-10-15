import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaSource } from "@memory-shoebox/shared";
import { createMediaPrefetchScheduler } from "./createMediaPrefetchScheduler";
import type {
  PrefetchCandidate,
  PrefetchEnvironment,
  SpeculativeMedia,
} from "./mediaPrefetch.types";

const ENVIRONMENT: PrefetchEnvironment = {
  memberId: "member",
  selectionKey: "selected-photo",
  visible: true,
  saveData: false,
  effectiveType: "4g",
};

function _candidate(
  id: string,
  rank = 0,
  source: Partial<MediaSource> = {},
): PrefetchCandidate {
  return {
    itemId: id,
    rank,
    kind: "photo",
    decode: rank === 0,
    source: {
      renditionId: id,
      purpose: "display",
      url: `https://bucket.test/${id}`,
      issuedAt: new Date(0).toISOString(),
      expiresAt: new Date(3600000).toISOString(),
      contentType: "image/jpeg",
      byteSize: 1024 * 1024,
      width: 2048,
      height: 2048,
      ...source,
    },
  };
}

function _harness() {
  const starts: Array<{
    candidate: PrefetchCandidate;
    signal: AbortSignal;
    finish: () => void;
    fail: () => void;
  }> = [];
  const retained = new Set<string>();
  let active = 0;
  let maxActive = 0;
  let reservedBytes = 0;
  let maxReservedBytes = 0;
  const scheduler = createMediaPrefetchScheduler({
    clock: Date.now,
    load: (candidate, signal) => {
      active += 1;
      maxActive = Math.max(active, maxActive);
      reservedBytes += candidate.source.byteSize;
      maxReservedBytes = Math.max(reservedBytes, maxReservedBytes);
      return new Promise<SpeculativeMedia>((resolve, reject) => {
        let released = false;
        const release = () => {
          if (!released) {
            released = true;
            retained.delete(candidate.source.renditionId);
            reservedBytes -= candidate.source.byteSize;
          }
        };
        starts.push({
          candidate,
          signal,
          finish: () => {
            active -= 1;
            if (candidate.decode) {
              retained.add(candidate.source.renditionId);
            }
            resolve({ release });
          },
          fail: () => {
            active -= 1;
            release();
            reject(new Error("offline"));
          },
        });
      });
    },
  });
  return {
    scheduler,
    starts,
    retained,
    getMaxActive: () => {
      return maxActive;
    },
    getReservedBytes: () => {
      return reservedBytes;
    },
    getMaxReservedBytes: () => {
      return maxReservedBytes;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("bounded media prefetch", () => {
  it("keeps a completed decoded promotion reserved through clear until selected decode releases it", async () => {
    const candidate = _candidate("ready");
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
    scheduler.schedule([_candidate("following")], {
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
  it("starts two ahead and one behind after 250 ms", async () => {
    const { scheduler, starts } = _harness();
    scheduler.schedule(
      [
        _candidate("behind", 2),
        _candidate("ahead-2", 1),
        _candidate("ahead-1"),
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

  it("never exceeds two operations or 8 MiB", async () => {
    const harness = _harness();
    const sources = [0, 1, 2].map((rank) => {
      return _candidate(String(rank), rank, { byteSize: 4 * 1024 ** 2 });
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

  it("decodes only the nearest photo within 32 MiB", async () => {
    const { scheduler, starts, retained } = _harness();
    scheduler.schedule(
      [
        _candidate("nearest", 0, { width: 4096, height: 2048 }),
        { ..._candidate("second", 1), decode: true },
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

  it.each([
    { saveData: true },
    { effectiveType: "slow-2g" as const },
    { effectiveType: "2g" as const },
    { visible: false },
  ])("disables speculation for %j", async (environment) => {
    const { scheduler, starts } = _harness();
    scheduler.schedule([_candidate("photo")], {
      ...ENVIRONMENT,
      ...environment,
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(starts).toHaveLength(0);
  });

  it("limits 3G to the immediate photo and posters", async () => {
    const { scheduler, starts } = _harness();
    scheduler.schedule(
      [
        _candidate("immediate"),
        _candidate("farther", 1),
        { ..._candidate("poster", 2), kind: "poster", decode: false },
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

  it("uses the bounded policy when the connection API is unknown", async () => {
    const { scheduler, starts } = _harness();
    scheduler.schedule([_candidate("first"), _candidate("second", 1)], {
      ...ENVIRONMENT,
      effectiveType: "unknown",
    });
    await vi.advanceTimersByTimeAsync(250);
    expect(starts).toHaveLength(2);
  });

  it("discards reversed queued work but reserves unavoidable transfers until settled", async () => {
    const harness = _harness();
    harness.scheduler.schedule(
      [
        _candidate("old", 0, { byteSize: 7 * 1024 ** 2 }),
        _candidate("old-queued", 1, { byteSize: 2 * 1024 ** 2 }),
      ],
      ENVIRONMENT,
    );
    await vi.advanceTimersByTimeAsync(250);
    harness.scheduler.schedule(
      [_candidate("reverse", 0, { byteSize: 2 * 1024 ** 2 })],
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

  it("skips oversized sources and never decodes a photo over 32 MiB", async () => {
    const { scheduler, starts } = _harness();
    scheduler.schedule(
      [
        _candidate("oversized", 0, { byteSize: 8 * 1024 ** 2 + 1 }),
        _candidate("too-many-pixels", 1, { width: 8192, height: 8192 }),
        _candidate("small", 2),
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

  it("deduplicates a rendition even when its lease URL changes", async () => {
    const { scheduler, starts } = _harness();
    scheduler.schedule(
      [
        _candidate("shared"),
        _candidate("shared", 1, { url: "https://bucket.test/renewed" }),
      ],
      ENVIRONMENT,
    );
    await vi.advanceTimersByTimeAsync(250);
    scheduler.schedule(
      [_candidate("shared", 0, { url: "https://bucket.test/newer" })],
      ENVIRONMENT,
    );
    await vi.advanceTimersByTimeAsync(250);
    expect(starts).toHaveLength(1);
    expect(starts[0]!.signal.aborted).toBe(false);
    starts[0]!.finish();
    await vi.advanceTimersByTimeAsync(0);
    scheduler.schedule([_candidate("shared")], ENVIRONMENT);
    await vi.advanceTimersByTimeAsync(250);
    expect(starts).toHaveLength(1);
  });

  it("does not cancel an in-flight candidate promoted to foreground", async () => {
    const { scheduler, starts, retained } = _harness();
    scheduler.schedule(
      [_candidate("selected"), _candidate("obsolete", 1)],
      ENVIRONMENT,
    );
    await vi.advanceTimersByTimeAsync(250);
    const release = scheduler.promote({
      itemId: "selected",
      source: _candidate("selected").source,
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

  it("retires foreground adoption while keeping unsettled bytes reserved", async () => {
    const harness = _harness();
    const candidate = _candidate("adopted", 0, { byteSize: 8 * 1024 ** 2 });
    harness.scheduler.schedule([candidate], ENVIRONMENT);
    await vi.advanceTimersByTimeAsync(250);
    const release = harness.scheduler.promote({
      itemId: "adopted",
      source: _candidate("adopted").source,
    }).release;
    harness.scheduler.clear();
    expect(harness.starts[0]!.signal.aborted).toBe(false);
    release();
    harness.scheduler.clear();
    expect(harness.starts[0]!.signal.aborted).toBe(true);
    expect(harness.getReservedBytes()).toBe(8 * 1024 ** 2);
    harness.scheduler.schedule([_candidate("later")], ENVIRONMENT);
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

  it("releases each foreground owner only once", async () => {
    const { scheduler, starts } = _harness();
    scheduler.schedule([_candidate("adopted")], ENVIRONMENT);
    await vi.advanceTimersByTimeAsync(250);
    const releaseFirst = scheduler.promote({
      itemId: "adopted",
      source: _candidate("adopted").source,
    }).release;
    const releaseSecond = scheduler.promote({
      itemId: "adopted",
      source: _candidate("adopted").source,
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

  it("isolates a stale foreground release from a later load of the same rendition", async () => {
    const { scheduler, starts } = _harness();
    scheduler.schedule([_candidate("adopted")], ENVIRONMENT);
    await vi.advanceTimersByTimeAsync(250);
    const releaseOld = scheduler.promote({
      itemId: "adopted",
      source: _candidate("adopted").source,
    }).release;
    scheduler.clear();
    starts[0]!.finish();
    await vi.advanceTimersByTimeAsync(0);
    scheduler.schedule([_candidate("adopted")], ENVIRONMENT);
    await vi.advanceTimersByTimeAsync(250);
    const releaseCurrent = scheduler.promote({
      itemId: "adopted",
      source: _candidate("adopted").source,
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

  it("drops late results after sign-out and rejects scheduling after disposal", async () => {
    const { scheduler, starts, retained } = _harness();
    scheduler.schedule([_candidate("old-member")], ENVIRONMENT);
    await vi.advanceTimersByTimeAsync(250);
    scheduler.dispose();
    starts[0]!.finish();
    scheduler.schedule([_candidate("other-member")], {
      ...ENVIRONMENT,
      memberId: "other",
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(starts).toHaveLength(1);
    expect(starts[0]!.signal.aborted).toBe(true);
    expect([...retained]).toEqual([]);
  });

  it("discards old member work on a changed environment", async () => {
    const { scheduler, starts, retained } = _harness();
    scheduler.schedule([_candidate("old-member")], ENVIRONMENT);
    await vi.advanceTimersByTimeAsync(250);
    scheduler.schedule([_candidate("new-member")], {
      ...ENVIRONMENT,
      memberId: "other",
    });
    expect(starts[0]!.signal.aborted).toBe(true);
    starts[0]!.finish();
    await vi.advanceTimersByTimeAsync(250);
    expect([...retained]).toEqual([]);
    expect(
      starts.map(({ candidate }) => {
        return candidate.itemId;
      }),
    ).toEqual(["old-member", "new-member"]);
  });

  it("rejects expired leases and all video metadata while measurement-gated", async () => {
    const { scheduler, starts } = _harness();
    scheduler.schedule(
      [
        _candidate("expired", 0, { expiresAt: new Date(200).toISOString() }),
        {
          ..._candidate("original", 1, {
            purpose: "original",
            contentType: "video/mp4",
          }),
          kind: "video-metadata",
        },
        {
          ..._candidate("optimized", 2, {
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

  it("releases failed operations and does not retry them on every schedule", async () => {
    const harness = _harness();
    const candidates = [
      _candidate("broken"),
      _candidate("second", 1),
      _candidate("third", 2),
    ];
    harness.scheduler.schedule(candidates, ENVIRONMENT);
    await vi.advanceTimersByTimeAsync(250);
    harness.starts[0]!.fail();
    await vi.advanceTimersByTimeAsync(0);
    harness.scheduler.schedule(candidates, ENVIRONMENT);
    await vi.advanceTimersByTimeAsync(250);
    expect(
      harness.starts.map(({ candidate }) => {
        return candidate.itemId;
      }),
    ).toEqual(["broken", "second", "third"]);
    expect(harness.getMaxActive()).toBe(2);
  });
  it("reacquires the immediate decoded neighbor after the candidate window changes", async () => {
    const { scheduler, starts, retained } = _harness();
    scheduler.schedule([_candidate("first")], ENVIRONMENT);
    await vi.advanceTimersByTimeAsync(250);
    starts[0]!.finish();
    await vi.advanceTimersByTimeAsync(0);
    scheduler.schedule([_candidate("second")], ENVIRONMENT);
    await vi.advanceTimersByTimeAsync(0);
    starts[1]!.finish();
    await vi.advanceTimersByTimeAsync(0);
    expect([...retained]).toEqual(["second"]);
    scheduler.schedule([_candidate("first")], ENVIRONMENT);
    await vi.advanceTimersByTimeAsync(0);
    expect(starts).toHaveLength(3);
    starts[2]!.finish();
    await vi.advanceTimersByTimeAsync(0);
    expect([...retained]).toEqual(["first"]);
  });

  it("warms an immediate photo without requesting a decode above 32 MiB", async () => {
    const { scheduler, starts } = _harness();
    scheduler.schedule(
      [_candidate("large", 0, { width: 4096, height: 2049 })],
      ENVIRONMENT,
    );
    await vi.advanceTimersByTimeAsync(250);
    expect(starts).toHaveLength(1);
    expect(starts[0]!.candidate.decode).toBe(false);
  });
  it("suppresses promoted ownership on member disposal without releasing unsettled bytes", async () => {
    const harness = _harness();
    harness.scheduler.schedule([_candidate("foreground")], ENVIRONMENT);
    await vi.advanceTimersByTimeAsync(250);
    const release = harness.scheduler.promote({
      itemId: "foreground",
      source: _candidate("foreground").source,
    }).release;
    harness.scheduler.dispose();
    expect(harness.starts[0]!.signal.aborted).toBe(true);
    expect(harness.getReservedBytes()).toBe(1024 * 1024);
    harness.starts[0]!.finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.getReservedBytes()).toBe(0);
    expect([...harness.retained]).toEqual([]);
    release();
  });
});

for (const mismatch of [
  "item",
  "url",
  "rendition",
  "expiry",
  "epoch",
] as const) {
  it(`refuses a completed native handoff after ${mismatch} mismatch`, async () => {
    const candidate = _candidate("exact");
    const image = document.createElement("img");
    const release = vi.fn();
    let epoch = {};
    const scheduler = createMediaPrefetchScheduler({
      clock: Date.now,
      getEpoch: () => {
        return epoch;
      },
      load: async () => {
        return {
          release,
          decodedPhoto: {
            itemId: candidate.itemId,
            source: candidate.source,
            getImage: () => {
              return image;
            },
          },
        };
      },
    });
    scheduler.schedule([candidate], ENVIRONMENT);
    await vi.advanceTimersByTimeAsync(250);
    if (mismatch === "epoch") epoch = {};
    if (mismatch === "expiry") vi.setSystemTime(3_540_000);
    const promotion = scheduler.promote({
      itemId: mismatch === "item" ? "foreign" : candidate.itemId,
      source: {
        ...candidate.source,
        url:
          mismatch === "url"
            ? "https://bucket.test/renewed"
            : candidate.source.url,
        renditionId:
          mismatch === "rendition"
            ? "replacement"
            : candidate.source.renditionId,
      },
    });
    expect(promotion.decodedPhoto).toBeUndefined();
    promotion.release();
    scheduler.dispose();
    expect(release).toHaveBeenCalledOnce();
  });
}

it("never adopts an in-flight decode result after transport promotion", async () => {
  const candidate = _candidate("exact");
  const image = document.createElement("img");
  const release = vi.fn();
  const completion = Promise.withResolvers<SpeculativeMedia>();
  const scheduler = createMediaPrefetchScheduler({
    clock: Date.now,
    load: () => {
      return completion.promise;
    },
  });
  scheduler.schedule([candidate], ENVIRONMENT);
  await vi.advanceTimersByTimeAsync(250);
  const claim = scheduler.promote({
    itemId: candidate.itemId,
    source: candidate.source,
  });
  expect(claim.decodedPhoto).toBeUndefined();
  scheduler.clear();
  completion.resolve({
    release,
    decodedPhoto: {
      itemId: candidate.itemId,
      source: candidate.source,
      getImage: () => {
        return image;
      },
    },
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(claim.decodedPhoto).toBeUndefined();
  expect(release).toHaveBeenCalledOnce();
  claim.release();
  scheduler.dispose();
});

it("counts one handoff's encoded bytes until the last independent claim releases it", async () => {
  const candidate = _candidate("encoded", 0, { byteSize: 8 * 1024 ** 2 });
  const image = document.createElement("img");
  const release = vi.fn();
  const load = vi
    .fn<import("./mediaPrefetch.types").SpeculativeMediaLoader>(() => {
      return new Promise(() => {});
    })
    .mockResolvedValueOnce({
      release,
      decodedPhoto: {
        itemId: candidate.itemId,
        source: candidate.source,
        getImage: () => {
          return image;
        },
      },
    });
  const scheduler = createMediaPrefetchScheduler({ clock: Date.now, load });
  scheduler.schedule([candidate], ENVIRONMENT);
  await vi.advanceTimersByTimeAsync(250);
  const first = scheduler.promote({
    itemId: candidate.itemId,
    source: candidate.source,
  });
  const second = scheduler.promote({
    itemId: candidate.itemId,
    source: candidate.source,
  });
  first.release();
  first.release();
  expect(release).not.toHaveBeenCalled();
  scheduler.schedule([_candidate("encoded-next", 1)], {
    ...ENVIRONMENT,
    selectionKey: "encoded",
  });
  await vi.advanceTimersByTimeAsync(250);
  expect(load).toHaveBeenCalledOnce();
  second.release();
  expect(release).toHaveBeenCalledOnce();
  expect(load).toHaveBeenCalledTimes(2);
  scheduler.dispose();
});
