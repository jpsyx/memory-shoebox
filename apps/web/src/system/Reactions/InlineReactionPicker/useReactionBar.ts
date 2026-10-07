import { useTimeout, useWindowEvent } from "@mantine/hooks";
import { useState, type PointerEvent } from "react";

type ReactionBarState = {
  isOpen: boolean;
  isPinned: boolean;
  hold: () => void;
  open: () => void;
  close: () => void;
  onPointerEnter: (event: PointerEvent) => void;
  onPointerLeave: () => void;
};

/** Delayed hover with a bridge to the bar; explicit opening stays until dismissed. */
export function useReactionBar(): ReactionBarState {
  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const show = useTimeout(() => {
    if (!isOpen) {
      setIsPinned(false);
    }
    setIsOpen(true);
  }, 250);
  const hide = useTimeout(() => {
    setIsOpen(false);
  }, 180);
  const hold = () => {
    show.clear();
    hide.clear();
  };
  const close = () => {
    hold();
    setIsOpen(false);
  };
  useWindowEvent("keydown", (event) => {
    if (isOpen && event.key === "Escape") {
      close();
    }
  });
  return {
    isOpen,
    isPinned,
    hold,
    close,
    open: () => {
      hold();
      setIsPinned(true);
      setIsOpen(true);
    },
    onPointerEnter: (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        return;
      }
      hide.clear();
      show.start();
    },
    onPointerLeave: () => {
      show.clear();
      if (!isPinned) {
        hide.start();
      }
    },
  };
}
