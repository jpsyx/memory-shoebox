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
  const attempt = useRef(0);
  const [failure, setFailure] = useState<TimelineAnchor>();
  const retry = () => {
    const currentAttempt = ++attempt.current;
    if (failure) {
      void restoreAnchor(failure).then(
        () => {
          if (currentAttempt === attempt.current) {
            initial.current = undefined;
            setFailure(undefined);
          }
        },
        () => {},
      );
    }
  };
  useEffect(
    function restoreTimelinePosition() {
      if (restored.current || !hasRows) {
        return;
      }
      restored.current = true;
      let active = true;
      if (initial.current) {
        void restoreAnchor(initial.current).then(
          () => {
            if (active) {
              initial.current = undefined;
            }
          },
          () => {
            if (active) {
              setFailure(initial.current);
            }
          },
        );
      }
      return () => {
        active = false;
      };
    },
    [hasRows, restoreAnchor],
  );
  useEffect(
    function saveTimelinePosition() {
      const memory = resources?.timeline.get(viewKey);
      if (!memory || !hasRows) {
        return;
      }
      const save = () => {
        if (element.current && !initial.current) {
          memory.anchor = saveAnchor();
        }
      };
      if (!memory.anchor) {
        save();
      }
      window.addEventListener("scroll", save, { passive: true });
      return () => {
        window.removeEventListener("scroll", save);
        save();
      };
    },
    [resources, viewKey, hasRows, saveAnchor, element],
  );
  return { hasRestoreError: failure !== undefined, retry };
}
