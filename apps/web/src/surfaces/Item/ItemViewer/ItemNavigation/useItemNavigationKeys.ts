import { useEffect } from "react";
import type { ItemDirection } from "./itemNavigation.types";

function _canNavigate(event: KeyboardEvent): boolean {
  return (
    !(
      event.defaultPrevented ||
      event.isComposing ||
      event.repeat ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      document.fullscreenElement ||
      document.querySelector('[role="dialog"]')
    ) &&
    !(
      event.target instanceof Element &&
      event.target.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="menu"], [role="listbox"], [data-item-navigation-ignore]',
      )
    )
  );
}

/** Viewer shortcuts defer to typing, dialogs, video controls and handled keys. */
export function useItemNavigationKeys(
  move: (direction: ItemDirection) => Promise<void>,
): void {
  useEffect(
    function listenForItemNavigationKeys() {
      const onKeyDown = (event: KeyboardEvent) => {
        if (!_canNavigate(event)) {
          return;
        }
        const direction =
          event.key === "ArrowLeft" || event.key === "h"
            ? "previous"
            : event.key === "ArrowRight" || event.key === "l"
              ? "next"
              : undefined;
        if (direction === undefined) {
          return;
        }
        event.preventDefault();
        void move(direction);
      };
      window.addEventListener("keydown", onKeyDown);
      return () => {
        window.removeEventListener("keydown", onKeyDown);
      };
    },
    [move],
  );
}
