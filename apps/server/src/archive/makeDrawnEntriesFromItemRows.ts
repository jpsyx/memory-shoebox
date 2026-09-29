import type { ItemRow } from "./readItemsForDays.ts";

/** A stack, measured over the frames this viewer can actually see. */
export type DrawnBurst = {
  burstId: string;
  visibleFrameCount: number;
  startsAt: string;
  endsAt: string;
  coverItemId: string;
  hasUnseenFrames: boolean;
};

/** One print the pile draws: the item it draws, and the stack it stands for. */
export type DrawnEntry = {
  item: ItemRow;
  burst: DrawnBurst | undefined;
};

/** What a stack is built from, once its frames are known. */
type BurstStackParts = {
  burstId: string;
  /** The earliest visible frame, which is also where the stack stands. */
  firstFrame: ItemRow;
  frames: readonly ItemRow[];
  coverItemId: string | undefined;
};

/** The frames of each burst, in the order they arrived, which is by time. */
function _makeFramesByBurstId(
  rows: readonly ItemRow[],
): Map<string, ItemRow[]> {
  return rows.reduce<Map<string, ItemRow[]>>((frames, row) => {
    if (row.burstId === null) {
      return frames;
    }
    const existing = frames.get(row.burstId) ?? [];
    existing.push(row);
    frames.set(row.burstId, existing);
    return frames;
  }, new Map());
}

/**
 * One stack: the cover if it is visible, else the earliest visible frame, and
 * a count and a span taken over the visible frames only.
 */
function _makeStackFromFrames(options: Readonly<BurstStackParts>): DrawnEntry {
  const cover =
    options.frames.find((frame) => {
      return frame.itemId === options.coverItemId;
    }) ?? options.firstFrame;

  const endsAt = options.frames.reduce((latest, frame) => {
    return frame.capturedAt > latest ? frame.capturedAt : latest;
  }, options.firstFrame.capturedAt);

  return {
    item: cover,
    burst: {
      burstId: options.burstId,
      visibleFrameCount: options.frames.length,
      startsAt: options.firstFrame.capturedAt,
      endsAt,
      coverItemId: cover.itemId,
      hasUnseenFrames: options.frames.some((frame) => {
        return frame.isUnseen;
      }),
    },
  };
}

/**
 * Turns visible items into the prints the pile draws.
 *
 * Three rules, and only the middle one needs code
 * (`data-models.md` § `bursts`):
 *
 * | Visible frames | What the day gets                                       |
 * | -------------- | --------------------------------------------------------- |
 * | 0              | Nothing, and nothing counted. Frames being items buys it  |
 * | 1              | A plain print. Never a stack of one                       |
 * | 2 or more      | One entry, measured over the visible frames alone         |
 *
 * The stack stands at the position of its **earliest visible frame**, which is
 * the only position consistent with a day ordered oldest first: a burst is a
 * contiguous run, so the stack stands where the run started. Its identity is
 * the cover, which may be a later frame.
 *
 * @param options.rows The day's visible items, chronological.
 * @param options.coverItemIdsByBurstId `bursts.cover_item_id` per burst.
 */
export function makeDrawnEntriesFromItemRows(options: {
  rows: readonly ItemRow[];
  coverItemIdsByBurstId: ReadonlyMap<string, string>;
}): DrawnEntry[] {
  const framesByBurstId = _makeFramesByBurstId(options.rows);

  return options.rows.flatMap((row) => {
    const burstId = row.burstId;
    if (burstId === null) {
      return [{ item: row, burst: undefined }];
    }
    const frames = framesByBurstId.get(burstId) ?? [];
    if (frames.length < 2) {
      return [{ item: row, burst: undefined }];
    }
    // The stack occupies the position of its earliest visible frame, decided
    // here by identity. Which item it draws (the cover) is decided below in
    // `_makeStackFromFrames`, and the two need not be the same frame, so every
    // later frame is skipped here without losing the cover.
    const isEarliestVisibleFrame = frames[0]?.itemId === row.itemId;
    if (!isEarliestVisibleFrame) {
      return [];
    }
    return [
      _makeStackFromFrames({
        burstId,
        firstFrame: row,
        frames,
        coverItemId: options.coverItemIdsByBurstId.get(burstId),
      }),
    ];
  });
}
