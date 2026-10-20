import { clsx } from "clsx";
import {
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { TheaterMode } from "./useTheaterMode/useTheaterMode";
import classes from "./ItemTheater.module.css";

type Props = { theater: TheaterMode; children: ReactNode };
function _lockOutsideHost(root: HTMLElement): () => void {
  const siblings: Array<{ element: HTMLElement; inert: boolean }> = [];
  let ancestor: HTMLElement | null = root;
  while (ancestor !== null && ancestor !== document.body) {
    for (const sibling of ancestor.parentElement?.children ?? []) {
      if (sibling !== ancestor && sibling instanceof HTMLElement) {
        siblings.push({ element: sibling, inert: sibling.inert });
        sibling.inert = true;
      }
    }
    ancestor = ancestor.parentElement;
  }
  const overflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  return () => {
    document.body.style.overflow = overflow;
    for (const sibling of siblings) {
      sibling.element.inert = sibling.inert;
    }
  };
}
function _getFocusableFromHost(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]',
    ),
  ).filter((element) => {
    return !element.closest('[inert], [hidden], [aria-hidden="true"]');
  });
}
function _onHostKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  theater: TheaterMode,
): void {
  if (theater.presentation !== "theater" || event.defaultPrevented) {
    return;
  }
  if (event.key === "Escape") {
    if (
      document.fullscreenElement === event.currentTarget ||
      event.currentTarget.querySelector(
        '[role="dialog"], [role="menu"], [role="listbox"]',
      )
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    theater.exit();
  } else if (event.key === "Tab") {
    const controls = _getFocusableFromHost(event.currentTarget);
    const firstControl = controls[0];
    const lastControl = controls.at(-1);
    if (
      event.shiftKey &&
      (document.activeElement === firstControl ||
        document.activeElement === event.currentTarget)
    ) {
      event.preventDefault();
      lastControl?.focus();
    } else if (!event.shiftKey && document.activeElement === lastControl) {
      event.preventDefault();
      firstControl?.focus();
    }
  }
}
function _containFocus(root: HTMLElement): () => void {
  const focusBack = () => {
    root.querySelector<HTMLButtonElement>("[data-theater-back]")?.focus();
  };
  const keepFocusInside = (event: FocusEvent) => {
    if (event.target instanceof Node && !root.contains(event.target)) {
      focusBack();
    }
  };
  const observer = new MutationObserver(() => {
    if (!root.contains(document.activeElement)) {
      focusBack();
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  document.addEventListener("focusin", keepFocusInside);
  focusBack();
  return () => {
    observer.disconnect();
    document.removeEventListener("focusin", keepFocusInside);
  };
}
function _restoreCurrentEntryFocus(root: HTMLElement): () => void {
  const focusEntry = () => {
    const entry = root.querySelector<HTMLButtonElement>(
      "[data-theater-entry]:not(:disabled)",
    );
    if (entry === null || entry.closest("[inert], [hidden]")) {
      return false;
    }
    entry.focus({ preventScroll: true });
    return document.activeElement === entry;
  };
  if (focusEntry()) {
    return () => {};
  }
  _getFocusableFromHost(root)[0]?.focus({ preventScroll: true });
  const retire = () => {
    observer.disconnect();
    document.removeEventListener("pointerdown", retire, true);
    document.removeEventListener("keydown", retire, true);
  };
  const observer = new MutationObserver(() => {
    if (focusEntry()) {
      retire();
    }
  });
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["disabled", "inert", "hidden"],
  });
  document.addEventListener("pointerdown", retire, true);
  document.addEventListener("keydown", retire, true);
  return retire;
}
function useModalOwnership(theater: TheaterMode): void {
  const { hostRef, presentation } = theater;
  const shouldRestoreFocus = useRef(false);
  useLayoutEffect(() => {
    const root = hostRef.current;
    if (root === null) {
      return;
    }
    if (presentation !== "theater") {
      if (shouldRestoreFocus.current) {
        shouldRestoreFocus.current = false;
        return _restoreCurrentEntryFocus(root);
      }
      return;
    }
    shouldRestoreFocus.current = true;
    const unlock = _lockOutsideHost(root);
    const releaseFocus = _containFocus(root);
    return () => {
      releaseFocus();
      unlock();
    };
  }, [hostRef, presentation]);
}

/** Always mounted across query branches, with modal ownership only in theater. */
export function ItemTheaterHost({
  theater,
  children,
}: Readonly<Props>): ReactNode {
  useModalOwnership(theater);
  const isTheater = theater.presentation === "theater";
  return (
    <div
      ref={theater.hostRef}
      data-item-theater-host
      className={clsx(
        classes.itemTheaterHost,
        isTheater && classes.itemTheaterStage,
      )}
      role={isTheater ? "dialog" : undefined}
      aria-modal={isTheater || undefined}
      aria-label={isTheater ? "Media theater" : undefined}
      tabIndex={isTheater ? -1 : undefined}
      onKeyDown={(event) => {
        _onHostKeyDown(event, theater);
      }}
    >
      {children}
    </div>
  );
}
