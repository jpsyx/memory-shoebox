import { describe, expect, it, vi } from "vitest";

import { createMediaPrefetchScheduler } from "../createMediaPrefetchScheduler";

import type { SpeculativeMedia } from "../../mediaPrefetch.types";
import {
  createPrefetchHarness,
  ENVIRONMENT,
  installCreateMediaPrefetchSchedulerTestLifecycle,
  makePrefetchCandidateFromId,
} from "./createMediaPrefetchSchedulerTestHelpers";
installCreateMediaPrefetchSchedulerTestLifecycle();
describe("bounded media prefetch", () => {
  it("drops late results after sign-out and rejects scheduling after disposal", async () => {
    const { scheduler, starts, retained } = createPrefetchHarness();
    scheduler.schedule(
      [makePrefetchCandidateFromId("old-member")],
      ENVIRONMENT,
    );
    await vi.advanceTimersByTimeAsync(250);
    scheduler.dispose();
    starts[0]!.finish();
    scheduler.schedule([makePrefetchCandidateFromId("other-member")], {
      ...ENVIRONMENT,
      memberId: "other",
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(starts).toHaveLength(1);
    expect(starts[0]!.signal.aborted).toBe(true);
    expect([...retained]).toEqual([]);
  });
});
describe("bounded media prefetch", () => {
  it("discards old member work on a changed environment", async () => {
    const { scheduler, starts, retained } = createPrefetchHarness();
    scheduler.schedule(
      [makePrefetchCandidateFromId("old-member")],
      ENVIRONMENT,
    );
    await vi.advanceTimersByTimeAsync(250);
    scheduler.schedule([makePrefetchCandidateFromId("new-member")], {
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
});
describe("bounded media prefetch", () => {
  it("releases failed operations and does not retry them on every schedule", async () => {
    const harness = createPrefetchHarness();
    const candidates = [
      makePrefetchCandidateFromId("broken"),
      makePrefetchCandidateFromId("second", 1),
      makePrefetchCandidateFromId("third", 2),
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
});
describe("bounded media prefetch", () => {
  it("reacquires the immediate decoded neighbor after the candidate window changes", async () => {
    const { scheduler, starts, retained } = createPrefetchHarness();
    scheduler.schedule([makePrefetchCandidateFromId("first")], ENVIRONMENT);
    await vi.advanceTimersByTimeAsync(250);
    starts[0]!.finish();
    await vi.advanceTimersByTimeAsync(0);
    scheduler.schedule([makePrefetchCandidateFromId("second")], ENVIRONMENT);
    await vi.advanceTimersByTimeAsync(0);
    starts[1]!.finish();
    await vi.advanceTimersByTimeAsync(0);
    expect([...retained]).toEqual(["second"]);
    scheduler.schedule([makePrefetchCandidateFromId("first")], ENVIRONMENT);
    await vi.advanceTimersByTimeAsync(0);
    expect(starts).toHaveLength(3);
    starts[2]!.finish();
    await vi.advanceTimersByTimeAsync(0);
    expect([...retained]).toEqual(["first"]);
  });
});
describe("bounded media prefetch", () => {
  it("suppresses promoted ownership on member disposal without releasing unsettled bytes", async () => {
    const harness = createPrefetchHarness();
    harness.scheduler.schedule(
      [makePrefetchCandidateFromId("foreground")],
      ENVIRONMENT,
    );
    await vi.advanceTimersByTimeAsync(250);
    const release = harness.scheduler.promote({
      itemId: "foreground",
      source: makePrefetchCandidateFromId("foreground").source,
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
    const candidate = makePrefetchCandidateFromId("exact");
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
    if (mismatch === "epoch") {
      epoch = {};
    }
    if (mismatch === "expiry") {
      vi.setSystemTime(3_540_000);
    }
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
  const candidate = makePrefetchCandidateFromId("exact");
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
  const candidate = makePrefetchCandidateFromId("encoded", 0, {
    byteSize: 8 * 1024 ** 2,
  });
  const image = document.createElement("img");
  const release = vi.fn();
  const load = vi
    .fn<import("../../mediaPrefetch.types").SpeculativeMediaLoader>(() => {
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
  scheduler.schedule([makePrefetchCandidateFromId("encoded-next", 1)], {
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
