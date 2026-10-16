import { useRef, type ReactNode } from "react";
import type { TimelineRenderRow } from "../../timelineWindow.types";
import { useTimelineWindow } from "../useTimelineWindow";

type Props = { rows: readonly TimelineRenderRow[] };

/** Exercises measured fan expansion with the same keyed item buttons. */
export function TimelineExpansionHarness({ rows }: Readonly<Props>): ReactNode {
  const element = useRef<HTMLDivElement>(null);
  const current = useTimelineWindow({
    rows,
    viewKey: "view",
    element,
    tileWidth: 200,
    viewportWidth: 300,
    isMobile: false,
  });
  return (
    <div ref={element}>
      {current.positions.map((position) => {
        const row = rows[position.index]!;
        return (
          <div
            key={row.key}
            data-index={position.index}
            data-timeline-row={row.key}
            ref={current.virtualizer.measureElement}
            style={{
              top:
                current.measurements[position.index]!.start -
                current.virtualizer.options.scrollMargin,
            }}
          >
            {row.itemIds.map((id) => {
              return <button key={id} data-item-id={id} />;
            })}
          </div>
        );
      })}
    </div>
  );
}
