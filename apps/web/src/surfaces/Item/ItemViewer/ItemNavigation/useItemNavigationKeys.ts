import { useEffect } from "react";
import type { ItemDirection } from "./itemNavigation.types";

type Options = { fullscreenRoot?: HTMLElement | null };
function _hasBlockingDialog(
  fullscreenRoot: HTMLElement | null | undefined,
): boolean {
  return Array.from(document.querySelectorAll('[role="dialog"]')).some(
    (dialog) => {
      return dialog !== fullscreenRoot;
    },
  );
}
function _isIgnoredTarget(
  event: KeyboardEvent,
  fullscreenRoot: HTMLElement | null | undefined,
): boolean {
  if (!(event.target instanceof Element)) {
    return false;
  }
  if (
    event.target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="menu"], [role="listbox"]',
    )
  ) {
    return true;
  }
  const ignored = event.target.closest("[data-item-navigation-ignore]");
  if (ignored === null) {
    return false;
  }
  // The picture remains a navigation surface in theater. Nested player
  // controls keep the same keyboard exclusion they have on the page.
  return !(
    fullscreenRoot?.getAttribute("role") === "dialog" &&
    fullscreenRoot.contains(ignored) &&
    ignored.hasAttribute("data-video-player") &&
    (event.target === ignored ||
      event.target.matches("video") ||
      event.target.closest("[data-video-player] > button") !== null)
  );
}
function _canNavigate(
  event: KeyboardEvent,
  options: Readonly<Options>,
): boolean {
  return !(
    event.defaultPrevented ||
    event.isComposing ||
    event.repeat ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    (document.fullscreenElement &&
      document.fullscreenElement !== options.fullscreenRoot) ||
    _hasBlockingDialog(options.fullscreenRoot) ||
    _isIgnoredTarget(event, options.fullscreenRoot)
  );
}

/** The sole viewer shortcut listener defers to typing and nested controls. */
export function useItemNavigationKeys(
  move: (direction: ItemDirection) => Promise<void>,
  options: Readonly<Options> = {},
): void {
  const { fullscreenRoot } = options;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!_canNavigate(event, { fullscreenRoot })) {
        return;
      }
      const direction =
        event.key === "ArrowLeft" || event.key === "h"
          ? "previous"
          : event.key === "ArrowRight" || event.key === "l"
            ? "next"
            : undefined;
      if (direction !== undefined) {
        event.preventDefault();
        void move(direction);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [move, fullscreenRoot]);
}
