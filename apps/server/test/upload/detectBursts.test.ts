import { describe, expect, it } from "vitest";
import {
  detectBursts,
  type BurstCandidate,
} from "../../src/upload/detectBursts.ts";

/** `appConfig.burst`, spelled out so a config change cannot move a test. */
const THRESHOLDS = { maxGapSeconds: 10, minimumFrameCount: 3 };

/** One frame per offset, in seconds after 06:41 on 14 September. */
function _makeFramesFromOffsets(options: {
  offsetsSeconds: readonly number[];
  capturedOn?: string;
  idPrefix?: string;
}): BurstCandidate[] {
  const capturedOn = options.capturedOn ?? "2026-09-14";
  const startMs = Date.parse(`${capturedOn}T06:41:00.000Z`);
  return options.offsetsSeconds.map((offsetSeconds, index) => {
    return {
      itemId: `${options.idPrefix ?? "frame"}-${String(index).padStart(3, "0")}`,
      capturedOn,
      capturedAt: new Date(startMs + offsetSeconds * 1000).toISOString(),
    };
  });
}

describe("detectBursts", () => {
  it("collapses 45 frames four seconds apart into one burst", () => {
    const candidates = _makeFramesFromOffsets({
      offsetsSeconds: Array.from({ length: 45 }, (_unused, index) => {
        return index * 4;
      }),
    });

    const bursts = detectBursts({ candidates, ...THRESHOLDS });

    expect(bursts).toHaveLength(1);
    expect(bursts[0]?.itemIds).toEqual(
      candidates.map((candidate) => {
        return candidate.itemId;
      }),
    );
    expect(bursts[0]?.startsAt).toBe("2026-09-14T06:41:00.000Z");
    expect(bursts[0]?.endsAt).toBe("2026-09-14T06:43:56.000Z");
    expect(bursts[0]?.capturedOn).toBe("2026-09-14");
  });

  it("leaves two frames six seconds apart as two plain prints", () => {
    const candidates = _makeFramesFromOffsets({ offsetsSeconds: [0, 6] });

    expect(detectBursts({ candidates, ...THRESHOLDS })).toEqual([]);
  });

  it("holds a gap of exactly ten seconds together", () => {
    const candidates = _makeFramesFromOffsets({ offsetsSeconds: [0, 10, 20] });

    const bursts = detectBursts({ candidates, ...THRESHOLDS });

    expect(bursts).toHaveLength(1);
    expect(bursts[0]?.itemIds).toHaveLength(3);
  });

  it("cuts at a gap of eleven seconds", () => {
    const candidates = _makeFramesFromOffsets({
      offsetsSeconds: [0, 10, 20, 31, 41, 51],
    });

    const bursts = detectBursts({ candidates, ...THRESHOLDS });

    expect(
      bursts.map((burst) => {
        return burst.itemIds;
      }),
    ).toEqual([
      ["frame-000", "frame-001", "frame-002"],
      ["frame-003", "frame-004", "frame-005"],
    ]);
  });

  it("never merges two days, however close the instants are", () => {
    // Four frames two seconds apart across midnight: one run if the
    // partition were ignored, and two runs of two, so no burst, with it.
    const candidates: BurstCandidate[] = [
      {
        itemId: "a",
        capturedOn: "2026-09-14",
        capturedAt: "2026-09-14T23:59:56.000Z",
      },
      {
        itemId: "b",
        capturedOn: "2026-09-14",
        capturedAt: "2026-09-14T23:59:58.000Z",
      },
      {
        itemId: "c",
        capturedOn: "2026-09-15",
        capturedAt: "2026-09-15T00:00:00.000Z",
      },
      {
        itemId: "d",
        capturedOn: "2026-09-15",
        capturedAt: "2026-09-15T00:00:02.000Z",
      },
    ];

    expect(detectBursts({ candidates, ...THRESHOLDS })).toEqual([]);
  });

  it("orders unsorted input by capture time, then by id on a tie", () => {
    const [first, second, third] = _makeFramesFromOffsets({
      offsetsSeconds: [0, 2, 2],
    });
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error("three frames were made");
    }

    const bursts = detectBursts({
      candidates: [third, first, second],
      ...THRESHOLDS,
    });

    expect(bursts[0]?.itemIds).toEqual([
      first.itemId,
      second.itemId,
      third.itemId,
    ]);
  });

  it("finds nothing in nothing", () => {
    expect(detectBursts({ candidates: [], ...THRESHOLDS })).toEqual([]);
  });
});
