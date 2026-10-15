import { useCallback, useRef } from "react";
import { observeWindowOffset, type Virtualizer } from "@tanstack/react-virtual";

type WindowVirtualizer = Virtualizer<Window, HTMLElement>;

/** Acknowledges a completed geometry correction through Virtual's public observer. */
export function useTimelineScroll(): {
  observeOffset: typeof observeWindowOffset;
  correctOffset: (virtualizer: WindowVirtualizer, offset: number) => void;
} {
  const readBack = useRef<
    ((offset: number, isScrolling: boolean) => void) | undefined
  >(undefined);
  const observeOffset = useCallback<typeof observeWindowOffset>(
    (instance, callback) => {
      readBack.current = callback;
      const stop = observeWindowOffset(instance, callback);
      return () => {
        if (readBack.current === callback) readBack.current = undefined;
        stop?.();
      };
    },
    [],
  );
  const correctOffset = useCallback(
    (virtualizer: WindowVirtualizer, offset: number) => {
      virtualizer.scrollToOffset(offset, { behavior: "auto" });
      // This is a one-shot layout correction. Adopt actual browser readback before
      // a later measurement, then retire its absolute target so it cannot undo
      // the measurement's own compensation. Ordinary scrolling keeps its observer.
      readBack.current?.(window.scrollY, virtualizer.isScrolling);
      virtualizer.cancelScroll();
    },
    [],
  );
  return { observeOffset, correctOffset };
}
