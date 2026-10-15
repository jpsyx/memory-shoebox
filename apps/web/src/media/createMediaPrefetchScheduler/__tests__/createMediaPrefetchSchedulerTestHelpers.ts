import { afterEach, beforeEach, vi } from "vitest";

import type { MediaSource } from "@memory-shoebox/shared";

import { createMediaPrefetchScheduler } from "../createMediaPrefetchScheduler";

import type {
  PrefetchCandidate,
  PrefetchEnvironment,
  SpeculativeMedia,
} from "../../mediaPrefetch.types";
/** Shared scenario fixture. */
export const ENVIRONMENT: PrefetchEnvironment = {
  memberId: "member",
  selectionKey: "selected-photo",
  visible: true,
  saveData: false,
  effectiveType: "4g",
};
/** Shared scenario fixture. */
export function makePrefetchCandidateFromId(
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
/** Shared scenario fixture. */
export function createPrefetchHarness(): {
  scheduler: ReturnType<typeof createMediaPrefetchScheduler>;
  starts: Array<{
    candidate: PrefetchCandidate;
    signal: AbortSignal;
    finish: () => void;
    fail: () => void;
  }>;
  retained: Set<string>;
  getMaxActive: () => number;
  getReservedBytes: () => number;
  getMaxReservedBytes: () => number;
} {
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
/** Registers the owned scenario setup and cleanup. */
export function installCreateMediaPrefetchSchedulerTestLifecycle(): void {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });
}
