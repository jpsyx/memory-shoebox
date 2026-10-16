import type { BurstFrameRef, TimelineDay } from "@memory-shoebox/shared";
import type {
  TimelineExpansion,
  TimelineRenderRow,
} from "../timelineWindow.types";

type Options = {
  days: readonly TimelineDay[];
  columns: number;
  /** Available fan width after the incumbent padding, in CSS pixels. */
  fanWidth?: number;
  framesByBurstId?: ReadonlyMap<string, readonly BurstFrameRef[]>;
  expanded?: ReadonlyMap<string, TimelineExpansion>;
};

type FanLine = {
  frames: BurstFrameRef[];
  frameOffset: number;
  usedWidth: number;
};

function _getFanLines({
  frames,
  fanWidth,
}: {
  frames: readonly BurstFrameRef[];
  fanWidth: number;
}): FanLine[] {
  return frames.reduce<FanLine[]>((lines, frame, frameOffset) => {
    const presentation = frame.thumb ?? frame;
    const width = 112 * (presentation.width / presentation.height) + 8 - 25.6;
    const currentLine = lines.at(-1);
    if (
      currentLine === undefined ||
      currentLine.frames.length >= 20 ||
      currentLine.usedWidth + width > fanWidth
    ) {
      lines.push({ frames: [frame], frameOffset, usedWidth: width });
    } else {
      currentLine.frames.push(frame);
      currentLine.usedWidth += width;
    }
    return lines;
  }, []);
}

function _getFanRows({
  options,
  day,
  itemIndex,
}: {
  options: Readonly<Options>;
  day: TimelineDay;
  itemIndex: number;
}): TimelineRenderRow[] {
  const item = day.items[itemIndex]!;
  const burstId = item.burst!.burstId;
  const burstFrames = options.framesByBurstId?.get(burstId);
  const base = { day, seedBase: itemIndex, items: [item], burstId };
  return [
    {
      ...base,
      key: `${day.capturedOn}:${burstId}:header`,
      kind: "header",
      itemIds: [],
      isFanHeader: true,
      reservedHeight:
        burstFrames === undefined
          ? options.expanded?.get(burstId)?.height
          : undefined,
    },
    ..._getFanLines({
      frames: burstFrames ?? [],
      fanWidth: options.fanWidth ?? 600,
    }).map(({ frames, frameOffset }): TimelineRenderRow => {
      return {
        ...base,
        key: `${day.capturedOn}:${burstId}:${frames[0]!.itemId}`,
        kind: "media",
        itemIds: frames.map((frame) => {
          return frame.itemId;
        }),
        frames,
        frameOffset,
      };
    }),
  ];
}

function _getDayRows({
  day,
  options,
  columns,
}: {
  day: TimelineDay;
  options: Readonly<Options>;
  columns: number;
}): TimelineRenderRow[] {
  const dayRows = day.items.reduce<TimelineRenderRow[]>(
    (rows, item, itemIndex) => {
      if (item.burst && options.expanded?.has(item.burst.burstId)) {
        rows.push(..._getFanRows({ options, day, itemIndex }));
      } else {
        const currentRow = rows.at(-1)!;
        if (
          currentRow.kind === "media" &&
          currentRow.burstId === undefined &&
          currentRow.items.length < columns
        ) {
          rows[rows.length - 1] = {
            ...currentRow,
            items: [...currentRow.items, item],
            itemIds: [...currentRow.itemIds, item.itemId],
          };
        } else {
          rows.push({
            key: `${day.capturedOn}:${item.itemId}`,
            day,
            kind: "media",
            itemIds: [item.itemId],
            items: [item],
            seedBase: itemIndex,
          });
        }
      }
      return rows;
    },
    [
      {
        key: `${day.capturedOn}:header`,
        day,
        kind: "header",
        itemIds: [],
        seedBase: 0,
        items: [],
      },
    ],
  );
  dayRows[dayRows.length - 1]!.isLast = true;
  return dayRows;
}

/**
 * Preserves atomic metadata, occasion order and per-day seeds while splitting
 * render work.
 */
export function getTimelineRowsFromDays(
  options: Readonly<Options>,
): TimelineRenderRow[] {
  if (!Number.isFinite(options.columns) || options.columns < 1) {
    throw new RangeError("Timeline columns must be positive");
  }
  const columns = Math.floor(options.columns);
  return options.days.flatMap((day) => {
    return _getDayRows({ day, options, columns });
  });
}
