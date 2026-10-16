import { useLayoutEffect, useRef, type RefObject } from "react";
import type { VirtualItem, Virtualizer } from "@tanstack/react-virtual";
import type { TimelineWindowOptions } from "./timelineWindow.types.ts";
import { getEstimateFromTimelineRow } from "./timelineGeometryHelpers/timelineGeometryHelpers";
type MeasurementRetirementOptions = {
  options: Readonly<TimelineWindowOptions>;
  virtualizer: Virtualizer<Window, HTMLElement>;
  measurements: Measurements;
  isRetiring: RefObject<boolean>;
};

type Measurements = {
  sizes: RefObject<Map<string, { size: number; width: number }>>;
  width: RefObject<number>;
  sizeAt: (index: number) => number;
};

/**
 * Estimates retain only sizes measured for the current CSS width generation.
 */
export function useTimelineMeasurements(
  options: Readonly<TimelineWindowOptions>,
): Measurements {
  const sizes = useRef(new Map<string, { size: number; width: number }>());
  const width = useRef(options.tileWidth);
  return {
    sizes,
    width,
    sizeAt: (index) => {
      const row = options.rows[index]!;
      const measured = sizes.current.get(row.key);
      return measured?.width === options.tileWidth
        ? measured.size
        : getEstimateFromTimelineRow({
            row,
            tileWidth: options.tileWidth,
            isMobile: options.isMobile,
          });
    },
  };
}

/**
 * Retires historical Virtual keys through its public API, preserving current
 * estimates.
 */
export function useTimelineMeasurementRetirement({
  options,
  virtualizer,
  measurements,
  isRetiring,
}: Readonly<MeasurementRetirementOptions>): void {
  const { rows, tileWidth } = options;
  const { sizes, width } = measurements;
  useLayoutEffect(() => {
    const keys = new Set(
      rows.map((row) => {
        return row.key;
      }),
    );
    let retired = width.current !== tileWidth;
    sizes.current.forEach((measurement, key) => {
      if (!keys.has(key) || measurement.width !== tileWidth) {
        sizes.current.delete(key);
        retired = true;
      }
    });
    width.current = tileWidth;
    if (retired) {
      isRetiring.current = true;
      virtualizer.measure();
    }
  }, [rows, virtualizer, tileWidth, sizes, width, isRetiring]);
}

/**
 * All rendered coordinates come from one completed public Virtual measurement
 * snapshot.
 */
export function recordTimelineMeasurements({
  options,
  virtualizer,
  measurements,
}: Readonly<{
  options: Readonly<TimelineWindowOptions>;
  virtualizer: Virtualizer<Window, HTMLElement>;
  measurements: Measurements;
}>): VirtualItem[] {
  const snapshot = new Map(
    virtualizer.takeSnapshot().map((item) => {
      return [item.key, item];
    }),
  );
  let offset = virtualizer.options.scrollMargin;
  const result = options.rows.map((row, index) => {
    const measured = snapshot.get(row.key);
    if (measured) {
      offset = measured.end;
      return measured;
    }
    const start = offset;
    const size = measurements.sizeAt(index);
    offset += size;
    return { key: row.key, index, start, size, end: offset, lane: 0 };
  });
  // Never mutate estimate inputs during Virtual's individual resizeItem
  // callbacks.
  if (measurements.width.current === options.tileWidth) {
    snapshot.forEach((item) => {
      measurements.sizes.current.set(String(item.key), {
        size: item.size,
        width: options.tileWidth,
      });
    });
  }
  return result;
}
