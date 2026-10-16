import { afterEach, beforeEach, vi } from "vitest";

import type { MediaSource } from "@memory-shoebox/shared";

import { createMediaPrefetchScheduler } from "../createMediaPrefetchScheduler";

import type {
  PrefetchCandidate,
  PrefetchEnvironment,
  SpeculativeMedia,
} from "../../mediaPrefetch.types";
type PrefetchStart = {
  candidate: PrefetchCandidate;
  signal: AbortSignal;
  finish: () => void;
  fail: () => void;
};

type PrefetchHarness = {
  scheduler: ReturnType<typeof createMediaPrefetchScheduler>;
  starts: PrefetchStart[];
  retained: Set<string>;
  getMaxActive: () => number;
  getReservedBytes: () => number;
  getMaxReservedBytes: () => number;
};

/**
 * Visible member/selection on unrestricted 4G, used as the baseline
 * speculative-policy environment.
 */
export const ENVIRONMENT: PrefetchEnvironment = {
  memberId: "member",
  selectionKey: "selected-photo",
  visible: true,
  saveData: false,
  effectiveType: "4g",
};
/**
 * Returns a 1 MiB JPEG candidate with configurable source fields; only the
 * immediate rank requests decode ownership.
 */
export function makePrefetchCandidateFromId({
  id,
  rank = 0,
  source = {},
}: Readonly<{
  id: string;
  rank?: number;
  source?: Readonly<Partial<MediaSource>>;
}>): PrefetchCandidate {
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
/**
 * Creates the real scheduler with manually settled loads and explicit active,
 * retained-image and reserved-byte accounting; callers control settlement and
 * disposal.
 */
export function createPrefetchHarness(): PrefetchHarness {
  const starts: PrefetchStart[] = [];
  const retained = new Set<string>();
  let active = 0;
  let maxActive = 0;
  let reservedBytes = 0;
  let maxReservedBytes = 0;
  const scheduler = createMediaPrefetchScheduler({
    clock: Date.now,
    load: ({ candidate, signal }) => {
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
/**
 * Starts each scheduler scenario at fake time zero and restores real timers
 * after it.
 */
export function installCreateMediaPrefetchSchedulerTestLifecycle(): void {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });
}
