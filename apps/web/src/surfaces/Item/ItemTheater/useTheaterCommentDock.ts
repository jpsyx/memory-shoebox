import {
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEventHandler,
  type KeyboardEventHandler,
  type PointerEventHandler,
  type RefObject,
} from "react";
import type { ItemPresentation } from "../ItemViewer/ItemViewer.types";

/** Presentation-only interaction owner shared with the media Comment action. */
export type TheaterCommentDockController = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  onPointerEnter: PointerEventHandler<HTMLDivElement>;
  onPointerLeave: PointerEventHandler<HTMLDivElement>;
  onFocusCapture: FocusEventHandler<HTMLDivElement>;
  onBlurCapture: FocusEventHandler<HTMLDivElement>;
  onKeyDown: KeyboardEventHandler<HTMLDivElement>;
};
type Options = {
  presentation: ItemPresentation;
  itemId: string;
  fieldRef: RefObject<HTMLTextAreaElement | null>;
  isUnavailable: boolean;
};
type DockMemory = {
  root: HTMLDivElement | undefined;
  isOpen: boolean;
  isPointerInside: boolean;
  isFocusInside: boolean;
  isAutofocusing: boolean;
  shouldRestoreFocus: boolean;
  mode: "hover" | "explicit";
  timer: ReturnType<typeof setTimeout> | undefined;
};
type DockOwner = {
  options: Readonly<Options>;
  memory: DockMemory;
  setIsOpen: (isOpen: boolean) => void;
};
function _getRootFromOwner(
  owner: Readonly<DockOwner>,
): HTMLDivElement | undefined {
  return (
    owner.options.fieldRef.current?.closest<HTMLDivElement>(
      "[data-theater-comment-dock]",
    ) ?? owner.memory.root
  );
}
function _hasNestedInteraction(owner: Readonly<DockOwner>): boolean {
  return Array.from(
    _getRootFromOwner(owner)?.querySelectorAll(
      '[role="dialog"], [role="menu"]',
    ) ?? [],
  ).some((element) => {
    return (
      element instanceof HTMLElement &&
      element.style.display !== "none" &&
      element.getAttribute("aria-hidden") !== "true"
    );
  });
}
function _cancelClose(memory: DockMemory): void {
  clearTimeout(memory.timer);
  memory.timer = undefined;
}
function _close(owner: Readonly<DockOwner>): void {
  _cancelClose(owner.memory);
  owner.memory.isOpen = false;
  const root = _getRootFromOwner(owner);
  owner.memory.shouldRestoreFocus ||=
    owner.memory.isFocusInside ||
    (root?.contains(document.activeElement) ?? false);
  owner.memory.isFocusInside = false;
  owner.setIsOpen(false);
}
function _restoreFocus(owner: Readonly<DockOwner>): void {
  if (owner.memory.shouldRestoreFocus) {
    const trigger = _getRootFromOwner(owner)?.querySelector<HTMLButtonElement>(
      "[data-theater-comment-trigger]",
    );
    if (
      trigger === undefined ||
      trigger === null ||
      trigger.closest("[inert]") ||
      trigger.disabled
    ) {
      return;
    }
    trigger.focus();
    owner.memory.shouldRestoreFocus = document.activeElement !== trigger;
  }
}
function _scheduleClose(owner: Readonly<DockOwner>): void {
  const memory = owner.memory;
  if (
    !memory.isOpen ||
    (memory.mode === "hover" ? memory.isPointerInside : memory.isFocusInside) ||
    _hasNestedInteraction(owner)
  ) {
    return;
  }
  _cancelClose(memory);
  memory.timer = setTimeout(() => {
    memory.timer = undefined;
    if (
      !(memory.mode === "hover"
        ? memory.isPointerInside
        : memory.isFocusInside) &&
      !_hasNestedInteraction(owner)
    ) {
      _close(owner);
    }
  }, 450);
}
function _open(owner: Readonly<DockOwner>, mode: DockMemory["mode"]): void {
  if (owner.options.presentation !== "theater" || owner.options.isUnavailable) {
    return;
  }
  _cancelClose(owner.memory);
  owner.memory.mode = mode;
  if (owner.memory.isOpen) {
    _focusField(owner);
  }
  owner.memory.isOpen = true;
  owner.setIsOpen(true);
}
function _focusField(owner: Readonly<DockOwner>): void {
  owner.memory.isAutofocusing = true;
  owner.options.fieldRef.current?.focus();
  owner.memory.isAutofocusing = false;
}
function _focusAndObserve(
  owner: Readonly<DockOwner>,
): (() => void) | undefined {
  _focusField(owner);
  const root = _getRootFromOwner(owner);
  if (root === undefined) {
    return;
  }
  const observer = new MutationObserver(() => {
    if (_hasNestedInteraction(owner)) {
      _cancelClose(owner.memory);
    } else if (owner.memory.timer === undefined) {
      _scheduleClose(owner);
    }
  });
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-hidden", "style"],
  });
  return () => {
    observer.disconnect();
  };
}
function usePendingFocusRetirement(owner: Readonly<DockOwner>): void {
  const onUserMove = useEffectEvent((event: Event) => {
    if (
      event.target instanceof Node &&
      !_getRootFromOwner(owner)?.contains(event.target)
    ) {
      owner.memory.shouldRestoreFocus = false;
    }
  });
  useLayoutEffect(() => {
    document.addEventListener("pointerdown", onUserMove, true);
    document.addEventListener("keydown", onUserMove, true);
    return () => {
      document.removeEventListener("pointerdown", onUserMove, true);
      document.removeEventListener("keydown", onUserMove, true);
      owner.memory.shouldRestoreFocus = false;
    };
  }, [owner.memory]);
}
function useDockEffects(owner: Readonly<DockOwner>, isOpen: boolean): void {
  const { presentation, itemId, isUnavailable, fieldRef } = owner.options;
  const onReset = useEffectEvent(() => {
    _close(owner);
    if (presentation !== "theater") {
      owner.memory.shouldRestoreFocus = false;
    }
    owner.memory.isPointerInside = false;
    return () => {
      _cancelClose(owner.memory);
    };
  });
  const onOpen = useEffectEvent(() => {
    return _focusAndObserve(owner);
  });
  const onClosed = useEffectEvent(() => {
    _restoreFocus(owner);
  });
  usePendingFocusRetirement(owner);
  useLayoutEffect(() => {
    return onReset();
  }, [presentation, itemId, isUnavailable]);
  useLayoutEffect(() => {
    if (isOpen) {
      return onOpen();
    }
    onClosed();
    return undefined;
  }, [isOpen, fieldRef, itemId, isUnavailable]);
}
function _getPointerHandlersFromOwner(
  owner: Readonly<DockOwner>,
): Pick<TheaterCommentDockController, "onPointerEnter" | "onPointerLeave"> {
  return {
    onPointerEnter: (event) => {
      if (event.pointerType === "touch") {
        return;
      }
      owner.memory.root = event.currentTarget;
      owner.memory.isPointerInside = true;
      _cancelClose(owner.memory);
      if (!owner.memory.isOpen) {
        _open(owner, "hover");
      }
    },
    onPointerLeave: (event) => {
      if (
        event.relatedTarget instanceof Node &&
        event.currentTarget.contains(event.relatedTarget)
      ) {
        return;
      }
      owner.memory.isPointerInside = false;
      _scheduleClose(owner);
    },
  };
}
function _onDockKeyDown(
  event: Parameters<KeyboardEventHandler<HTMLDivElement>>[0],
  owner: Readonly<DockOwner>,
): void {
  if (event.key === "Escape") {
    if (
      event.target instanceof Element &&
      _getRootFromOwner(owner)?.contains(
        event.target.closest('[role="dialog"], [role="menu"]'),
      )
    ) {
      return;
    }
    if (owner.memory.isOpen && !_hasNestedInteraction(owner)) {
      event.stopPropagation();
      event.preventDefault();
      _close(owner);
    }
  } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    if (
      event.target instanceof Element &&
      event.target.hasAttribute("data-theater-comment-trigger")
    ) {
      event.preventDefault();
      _open(owner, "explicit");
    }
  } else if (owner.memory.isOpen) {
    owner.memory.mode = "explicit";
  }
}
function _getFocusHandlersFromOwner(
  owner: Readonly<DockOwner>,
): Pick<
  TheaterCommentDockController,
  "onFocusCapture" | "onBlurCapture" | "onKeyDown"
> {
  return {
    onFocusCapture: (event) => {
      owner.memory.root = event.currentTarget;
      owner.memory.isFocusInside = !event.target.hasAttribute(
        "data-theater-comment-trigger",
      );
      if (!owner.memory.isAutofocusing && owner.memory.isFocusInside) {
        owner.memory.mode = "explicit";
        _cancelClose(owner.memory);
      }
    },
    onBlurCapture: (event) => {
      if (
        event.relatedTarget instanceof Node &&
        event.currentTarget.contains(event.relatedTarget)
      ) {
        return;
      }
      owner.memory.isFocusInside = false;
      _scheduleClose(owner);
    },
    onKeyDown: (event) => {
      _onDockKeyDown(event, owner);
    },
  };
}
/** Owns comment opening, departure delay and focus without owning draft data. */
export function useTheaterCommentDock(
  options: Readonly<Options>,
): TheaterCommentDockController {
  const [isOpen, setIsOpen] = useState(false);
  const memory = useRef<DockMemory>({
    root: undefined,
    isOpen: false,
    isPointerInside: false,
    isFocusInside: false,
    isAutofocusing: false,
    shouldRestoreFocus: false,
    mode: "hover",
    timer: undefined,
  });
  const owner = { options, memory: memory.current, setIsOpen };
  useDockEffects(owner, isOpen);
  return {
    isOpen,
    open: () => {
      _open(owner, "explicit");
    },
    close: () => {
      _close(owner);
    },
    ..._getPointerHandlersFromOwner(owner),
    ..._getFocusHandlersFromOwner(owner),
  };
}
