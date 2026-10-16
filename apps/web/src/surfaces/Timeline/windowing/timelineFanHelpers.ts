import type { BurstFrameRef } from "@memory-shoebox/shared";
import type { VirtualItem } from "@tanstack/react-virtual";
import { useEffect, type RefObject } from "react";
import type { TimelineMemory } from "./createTimelineMemory/createTimelineMemory";
import type { TimelineRenderRow } from "./timelineWindow.types.ts";
type TimelineExpansionSizeOptions = {
  memory?: TimelineMemory;
  viewKey: string;
  rows: readonly TimelineRenderRow[];
  measurements: readonly VirtualItem[];
  framesByBurstId: ReadonlyMap<string, readonly BurstFrameRef[]>;
};

type TimelineFanRestorationOptions = {
  element: RefObject<HTMLElement | null>;
  isSelecting: boolean;
  rows: readonly TimelineRenderRow[];
  positions: readonly VirtualItem[];
  onOpenBurst: (burstId: string) => void;
};

/**
 * Only current, positively intersecting restored placeholders can read actual
 * burst frames.
 */
export function useTimelineFanRestoration(
  options: Readonly<TimelineFanRestorationOptions>,
): void {
  const { element, isSelecting, rows, positions, onOpenBurst } = options;
  useEffect(
    function restoreVisibleTimelineFans() {
      if (!element.current || isSelecting) {
        return;
      }
      let isActive = true;
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const burstId = (entry.target as HTMLElement).dataset.restoreBurst;
            if (
              isActive &&
              burstId &&
              entry.isIntersecting &&
              entry.intersectionRatio > 0
            ) {
              onOpenBurst(burstId);
            }
          });
        },
        { rootMargin: "0px", threshold: 0 },
      );
      element.current
        .querySelectorAll("[data-restore-burst]")
        .forEach((node) => {
          observer.observe(node);
        });
      return () => {
        isActive = false;
        observer.disconnect();
      };
    },
    [element, isSelecting, rows, positions, onOpenBurst],
  );
}

/** Stores scalar fan height separately from bounded retained frame arrays. */
export function useTimelineExpansionSizes(
  options: Readonly<TimelineExpansionSizeOptions>,
): void {
  const { memory, viewKey, rows, measurements, framesByBurstId } = options;
  useEffect(
    function retainTimelineExpansionSizes() {
      memory?.get(viewKey).expanded.forEach((expansion, burstId) => {
        if (!framesByBurstId.has(burstId)) {
          return;
        }
        expansion.height = rows.reduce((total, row, index) => {
          return row.burstId === burstId
            ? total + (measurements[index]?.size ?? 0)
            : total;
        }, 0);
      });
    },
    [memory, viewKey, rows, measurements, framesByBurstId],
  );
}
