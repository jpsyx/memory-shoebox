import { useLayoutEffect, useState, type RefObject } from "react";
/** Current measured CSS grid and viewport generation. */
export type TimelineLayout = {
  columns: number;
  tileWidth: number;
  fanWidth: number;
  isMobile: boolean;
  viewportWidth: number;
};
/**
 * Reads the incumbent CSS grid instead of introducing a parallel
 * breakpoint/column policy.
 */
export function useTimelineLayout(
  element: RefObject<HTMLElement | null>,
): TimelineLayout {
  const [layout, setLayout] = useState({
    columns: 4,
    tileWidth: 200,
    fanWidth: 800,
    isMobile: false,
    viewportWidth: 0,
  });
  useLayoutEffect(() => {
    const root = element.current;
    if (!root) {
      return;
    }
    const measure = () => {
      const pile = root.querySelector<HTMLElement>("[data-timeline-pile]");
      if (!pile) {
        return;
      }
      const width = pile.getBoundingClientRect().width;
      const tracks = getComputedStyle(pile)
        .gridTemplateColumns.split(" ")
        .filter((value) => {
          return value && value !== "none";
        });
      const columns = Math.max(1, tracks.length);
      const measured = {
        viewportWidth: window.innerWidth,
        columns,
        tileWidth: width / columns,
        fanWidth: Math.max(1, width - 58),
        isMobile: window.matchMedia("(max-width: 44em)").matches,
      };
      setLayout((previous) => {
        return JSON.stringify(previous) === JSON.stringify(measured)
          ? previous
          : measured;
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => {
      return observer.disconnect();
    };
  }, [element]);
  return layout;
}
