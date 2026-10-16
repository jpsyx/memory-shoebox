import { useRef, type ReactNode } from "react";
import type { TimelineRenderRow } from "../../timelineWindow.types";
import { useTimelineWindow } from "../useTimelineWindow";

type Props = {
  retained: readonly TimelineRenderRow[];
  origin: number;
  captureWindow: (window: ReturnType<typeof useTimelineWindow>) => void;
};

/**
 * Keeps the measured row keys stable while publishing the current hook result.
 */
export function TimelineTransactionHarness({
  retained,
  origin,
  captureWindow,
}: Readonly<Props>): ReactNode {
  const element = useRef<HTMLDivElement>(null);
  const current = useTimelineWindow({
    rows: retained,
    viewKey: "view",
    focusedItemId: "item-0",
    element,
    tileWidth: 102,
    viewportWidth: 300,
    isMobile: false,
  });
  captureWindow(current);
  return (
    <div ref={element} data-window-root data-origin={origin}>
      {current.positions.map((position) => {
        const row = retained[position.index]!;
        return (
          <div
            key={row.key}
            data-index={position.index}
            data-timeline-row={row.key}
            ref={current.virtualizer.measureElement}
            style={{
              top: position.start - current.virtualizer.options.scrollMargin,
            }}
          >
            <button data-item-id={row.itemIds[0]} />
          </div>
        );
      })}
    </div>
  );
}
