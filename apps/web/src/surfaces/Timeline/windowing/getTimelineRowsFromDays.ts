import type { BurstFrameRef, TimelineDay } from "@memory-shoebox/shared";
import type {
  TimelineExpansion,
  TimelineRenderRow,
} from "./timelineWindow.types";

type Options = {
  days: readonly TimelineDay[];
  columns: number;
  /** Available fan width after the incumbent padding, in CSS pixels. */
  fanWidth?: number;
  framesByBurstId?: ReadonlyMap<string, readonly BurstFrameRef[]>;
  expanded?: ReadonlyMap<string, TimelineExpansion>;
};

function _getFanRows(
  options: Readonly<Options>,
  day: TimelineDay,
  itemIndex: number,
): TimelineRenderRow[] {
  const item = day.items[itemIndex]!;
  const burstId = item.burst!.burstId;
  const frames = options.framesByBurstId?.get(burstId);
  const base = { day, seedBase: itemIndex, items: [item], burstId };
  const header: TimelineRenderRow = {
    ...base,
    key: `${day.capturedOn}:${burstId}:header`,
    kind: "header",
    itemIds: [],
    isFanHeader: true,
    reservedHeight:
      frames === undefined ? options.expanded?.get(burstId)?.height : undefined,
  };
  if (frames === undefined) return [header];
  const rows: TimelineRenderRow[] = [header];
  let frameOffset = 0;
  while (frameOffset < frames.length) {
    let end = frameOffset;
    let usedWidth = 0;
    while (end < frames.length) {
      const frame = frames[end]!;
      const width = 112 * (frame.width / frame.height) + 8 - 25.6;
      if (
        end > frameOffset &&
        (usedWidth + width > (options.fanWidth ?? 600) ||
          end - frameOffset >= 20)
      )
        break;
      usedWidth += width;
      end += 1;
    }
    const line = frames.slice(frameOffset, end);
    rows.push({
      ...base,
      key: `${day.capturedOn}:${burstId}:${line[0]!.itemId}`,
      kind: "media",
      itemIds: line.map((frame) => {
        return frame.itemId;
      }),
      frames: line,
      frameOffset,
    });
    frameOffset = end;
  }
  return rows;
}

/** Preserves atomic metadata, occasion order and per-day seeds while splitting render work. */
export function getTimelineRowsFromDays(
  options: Readonly<Options>,
): TimelineRenderRow[] {
  if (!Number.isFinite(options.columns) || options.columns < 1)
    throw new RangeError("Timeline columns must be positive");
  const columns = Math.floor(options.columns);
  return options.days.flatMap((day) => {
    const rows: TimelineRenderRow[] = [
      {
        key: `${day.capturedOn}:header`,
        day,
        kind: "header",
        itemIds: [],
        seedBase: 0,
        items: [],
      },
    ];
    let itemIndex = 0;
    while (itemIndex < day.items.length) {
      const item = day.items[itemIndex]!;
      if (item.burst && options.expanded?.has(item.burst.burstId)) {
        rows.push(..._getFanRows(options, day, itemIndex));
        itemIndex += 1;
        continue;
      }
      const seedBase = itemIndex;
      const items = [];
      while (itemIndex < day.items.length && items.length < columns) {
        const candidate = day.items[itemIndex]!;
        if (candidate.burst && options.expanded?.has(candidate.burst.burstId))
          break;
        items.push(candidate);
        itemIndex += 1;
      }
      rows.push({
        key: `${day.capturedOn}:${items[0]!.itemId}`,
        day,
        kind: "media",
        itemIds: items.map((value) => {
          return value.itemId;
        }),
        items,
        seedBase,
      });
    }
    rows[rows.length - 1]!.isLast = true;
    return rows;
  });
}
