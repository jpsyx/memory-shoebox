import type {
  TimelineAnchor,
  TimelineRenderRow,
  TimelineWindowOptions,
} from "../timelineWindow.types.ts";
type TimelineViewportOptions = {
  rows: readonly TimelineRenderRow[];
  start: number;
  end: number;
  size: (index: number) => number;
  focusedItemId?: string;
};

/** Estimates a row until its actual DOM height is measured. */
export function getEstimateFromTimelineRow({
  row,
  tileWidth,
  isMobile,
}: Readonly<{
  row: Readonly<TimelineRenderRow>;
  tileWidth: number;
  isMobile: boolean;
}>): number {
  const padding = row.isLast ? 36 : 8;
  if (row.reservedHeight) {
    return row.reservedHeight + padding;
  }
  if (row.isFanHeader) {
    return 64;
  }
  if (row.frames) {
    return 136 + padding;
  }
  if (row.kind === "header") {
    return Math.max(
      1,
      (isMobile ? 100 : 0) +
        (row.day.milestoneBand ? 140 : 0) +
        row.day.milestoneStrips.length * 50 +
        (row.day.items.length === 0 ? 70 : 0),
    );
  }
  return (
    Math.max(
      ...row.items.map((item) => {
        return ((tileWidth - 10) * item.media.height) / item.media.width + 10;
      }),
    ) + padding
  );
}

type OverscanOptions = {
  rows: readonly TimelineRenderRow[];
  boundary: number;
  direction: 1 | -1;
  size: (index: number) => number;
};

function _getOverscanBoundary({
  rows,
  boundary,
  direction,
  size,
}: Readonly<OverscanOptions>): number {
  const availableRows = direction < 0 ? boundary : rows.length - boundary - 1;
  let measuredHeight = 0;
  let edge = boundary;
  rows.some((_row, offset) => {
    if (offset >= availableRows || !(measuredHeight < window.innerHeight)) {
      return true;
    }
    edge += direction;
    measuredHeight += size(edge);
    return false;
  });
  return edge;
}

/**
 * One viewport of measured overscan each side, with a single focused row
 * pinned.
 */
export function getIndexesFromTimelineViewport(
  options: Readonly<TimelineViewportOptions>,
): number[] {
  const first = _getOverscanBoundary({
    rows: options.rows,
    boundary: options.start,
    direction: -1,
    size: options.size,
  });
  const last = _getOverscanBoundary({
    rows: options.rows,
    boundary: options.end,
    direction: 1,
    size: options.size,
  });
  const indexes = Array.from({ length: last - first + 1 }, (_, offset) => {
    return first + offset;
  });
  const focused = options.rows.findIndex((row) => {
    return (
      options.focusedItemId !== undefined &&
      row.itemIds.includes(options.focusedItemId)
    );
  });
  return [
    ...indexes,
    focused >= 0 && !indexes.includes(focused) ? focused : undefined,
  ]
    .filter((index) => {
      return index !== undefined;
    })
    .sort((left, right) => {
      return left - right;
    });
}

/** Finds the actual reading print or collapsed cover button. */
export function getAnchorNodeFromTimelineWindow({
  current,
  itemId,
}: Readonly<{
  current: Readonly<TimelineWindowOptions>;
  itemId: string | undefined;
}>): HTMLElement | undefined {
  const direct = [
    ...(current.element.current?.querySelectorAll<HTMLElement>(
      "[data-item-id]",
    ) ?? []),
  ].find((node) => {
    return node.dataset.itemId === itemId;
  });
  if (direct) {
    return direct;
  }
  const burstId = current.rows
    .flatMap((row) => {
      return row.items;
    })
    .find((item) => {
      return item.itemId === itemId;
    })?.burst?.burstId;
  return (
    [
      ...(current.element.current?.querySelectorAll<HTMLElement>(
        "[data-burst-id]",
      ) ?? []),
    ]
      .find((node) => {
        return node.dataset.burstId === burstId;
      })
      ?.querySelector<HTMLElement>("button") ?? undefined
  );
}

/** Captures a reading item with its exact containing-page provenance. */
export function getAnchorFromTimelineWindow(
  current: Readonly<TimelineWindowOptions>,
): TimelineAnchor {
  const elements = [
    ...(current.element.current?.querySelectorAll<HTMLElement>(
      "[data-item-id],[data-burst-id]",
    ) ?? []),
  ];
  const node = elements.find((element) => {
    return (
      element.getBoundingClientRect().bottom > 80 &&
      element.getBoundingClientRect().top < window.innerHeight
    );
  });
  const itemId =
    node?.dataset.itemId ??
    (node?.dataset.burstId
      ? current.rows
          .flatMap((row) => {
            return row.items;
          })
          .find((item) => {
            return item.burst?.burstId === node.dataset.burstId;
          })?.itemId
      : undefined);
  const row =
    current.rows.find((candidate) => {
      return itemId !== undefined && candidate.itemIds.includes(itemId);
    }) ?? current.rows[0];
  return {
    capturedOn: row?.day.capturedOn ?? "",
    itemId,
    burstId: row?.burstId,
    offsetPx:
      getAnchorNodeFromTimelineWindow({
        current,
        itemId,
      })?.getBoundingClientRect().top ?? 0,
    pageCursor: current.pageCursors?.get(row?.day.capturedOn ?? ""),
  };
}
