import { MediaLoadingContext } from "@/media/MediaLoadingContext";
import { useContext, useEffect, useRef, useState, type RefObject } from "react";
import type { TimelineAnchor } from "./timelineWindow.types";

type Options = {
  viewKey: string;
  hasRows: boolean;
  element: RefObject<HTMLElement | null>;
  saveAnchor: () => TimelineAnchor;
  restoreAnchor: (anchor: TimelineAnchor) => Promise<void>;
};

/** Compact navigation positions survive unmount; failed recovery leaves a visible retry. */
export function useTimelinePosition(options: Readonly<Options>): {
  hasRestoreError: boolean;
  retry: () => void;
} {
  const { viewKey, hasRows, element, saveAnchor, restoreAnchor } = options;
  const resources = useContext(MediaLoadingContext);
  const initial = useRef(resources?.timeline.get(viewKey).anchor);
  const restored = useRef(false);
  const [failure, setFailure] = useState<TimelineAnchor>();
  const retry = () => {
    if (failure)
      void restoreAnchor(failure).then(
        () => {
          return setFailure(undefined);
        },
        () => {},
      );
  };
  useEffect(() => {
    if (restored.current || !hasRows) return;
    restored.current = true;
    let active = true;
    if (initial.current)
      void restoreAnchor(initial.current).catch(() => {
        if (active) setFailure(initial.current);
      });
    return () => {
      active = false;
    };
  }, [hasRows, restoreAnchor]);
  useEffect(() => {
    const memory = resources?.timeline.get(viewKey);
    if (!memory || !hasRows) return;
    const save = () => {
      if (element.current) memory.anchor = saveAnchor();
    };
    if (!memory.anchor) save();
    window.addEventListener("scroll", save, { passive: true });
    return () => {
      window.removeEventListener("scroll", save);
      save();
    };
  }, [resources, viewKey, hasRows, saveAnchor, element]);
  return { hasRestoreError: failure !== undefined, retry };
}
