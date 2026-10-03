/** One item as burst detection sees it: when it was taken, and on which day. */
export type BurstCandidate = {
  itemId: string;
  /** `YYYY-MM-DD`, local to `shoebox.timezone`. The partition key. */
  capturedOn: string;
  /** ISO-8601 UTC instant. The order, and the gap. */
  capturedAt: string;
};

/** One run of frames shot together, before it has a row. */
export type DetectedBurst = {
  capturedOn: string;
  startsAt: string;
  endsAt: string;
  /** Capture order; index + 1 is `burst_index`. */
  itemIds: string[];
};

/**
 * Day first, then capture time, then item id.
 *
 * The id is the last key only so that two frames stamped in the same second
 * come out in the same order on every run: a burst's `burst_index` must not
 * depend on the order SQLite happened to return the rows in.
 */
function _compareCandidates(
  left: Readonly<BurstCandidate>,
  right: Readonly<BurstCandidate>,
): number {
  if (left.capturedOn !== right.capturedOn) {
    return left.capturedOn < right.capturedOn ? -1 : 1;
  }
  const byTime = Date.parse(left.capturedAt) - Date.parse(right.capturedAt);
  if (byTime !== 0) {
    return byTime;
  }
  return left.itemId === right.itemId ? 0 : left.itemId < right.itemId ? -1 : 1;
}

/**
 * Whether `frame` continues the run that `previousFrame` ends.
 *
 * Two days never continue each other, however close the instants: the
 * partition is by `capturedOn`, so 23:59:58 and 00:00:01 are two days.
 */
function _isSameRun(options: {
  previousFrame: Readonly<BurstCandidate> | undefined;
  frame: Readonly<BurstCandidate>;
  maxGapSeconds: number;
}): boolean {
  const { previousFrame, frame } = options;
  if (previousFrame === undefined) {
    return false;
  }
  const gapSeconds =
    (Date.parse(frame.capturedAt) - Date.parse(previousFrame.capturedAt)) /
    1000;
  return (
    previousFrame.capturedOn === frame.capturedOn &&
    gapSeconds <= options.maxGapSeconds
  );
}

/** Cuts sorted frames into runs where the day changes or the gap is too big. */
function _splitIntoRuns(options: {
  sortedFrames: readonly BurstCandidate[];
  maxGapSeconds: number;
}): BurstCandidate[][] {
  return options.sortedFrames.reduce<BurstCandidate[][]>((runs, frame) => {
    const currentRun = runs.at(-1);
    const isSameRun = _isSameRun({
      previousFrame: currentRun?.at(-1),
      frame,
      maxGapSeconds: options.maxGapSeconds,
    });
    if (currentRun !== undefined && isSameRun) {
      currentRun.push(frame);
    } else {
      runs.push([frame]);
    }
    return runs;
  }, []);
}

/**
 * The bursts in one session's items (`apis/upload.md` § Burst detection).
 *
 * Partition by `capturedOn`, order by `capturedAt`, and start a new run when
 * the gap to the previous frame **exceeds** `maxGapSeconds`, so a gap of
 * exactly the threshold holds together. A run shorter than
 * `minimumFrameCount` is not a burst: two photographs six seconds apart stay
 * two plain prints.
 *
 * Pure over rows, so the "45 frames four seconds apart" test needs no
 * database. The caller passes `appConfig.burst`, which is what the burst row
 * records alongside the detector version.
 *
 * @param options.candidates The session's items, in any order.
 * @param options.maxGapSeconds The largest gap that stays in one run.
 * @param options.minimumFrameCount The fewest frames that make a burst.
 * @returns The bursts, by day and then by start, each in capture order.
 */
export function makeBurstsFromCandidates(
  options: Readonly<{
    candidates: readonly BurstCandidate[];
    maxGapSeconds: number;
    minimumFrameCount: number;
  }>,
): DetectedBurst[] {
  const sortedFrames = [...options.candidates].sort(_compareCandidates);
  const runs = _splitIntoRuns({
    sortedFrames,
    maxGapSeconds: options.maxGapSeconds,
  });

  return runs.flatMap((run) => {
    const firstFrame = run[0];
    const lastFrame = run.at(-1);
    if (
      firstFrame === undefined ||
      lastFrame === undefined ||
      run.length < options.minimumFrameCount
    ) {
      return [];
    }
    return [
      {
        capturedOn: firstFrame.capturedOn,
        startsAt: firstFrame.capturedAt,
        endsAt: lastFrame.capturedAt,
        itemIds: run.map((frame) => {
          return frame.itemId;
        }),
      },
    ];
  });
}
