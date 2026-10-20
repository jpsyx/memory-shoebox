import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { ItemPresentation } from "../../ItemViewer/ItemViewer.types";

/** One application-owned fullscreen host and presentation for an item visit. */
export type TheaterMode = {
  hostRef: RefObject<HTMLDivElement | null>;
  presentation: ItemPresentation;
  isFullscreen: boolean;
  playbackPreferences: RefObject<{ isMuted: boolean }>;
  enter: () => void;
  exit: () => void;
  toggleFullscreen: () => void;
};
type Owner = {
  root: HTMLDivElement | null;
  presentation: ItemPresentation;
  isMounted: boolean;
  onBeforeExit: () => void;
  scrollPosition: { left: number; top: number } | undefined;
};
function _exitOwnedFullscreen(root: HTMLElement | null): void {
  if (root !== null && document.fullscreenElement === root) {
    void document.exitFullscreen?.().catch(() => {});
  }
}
function _requestFullscreen(owner: Owner): void {
  const root = owner.root;
  try {
    // Keep the browser request in the original activation gesture.
    const request = root?.requestFullscreen?.();
    void request
      ?.then(() => {
        if (!owner.isMounted || owner.presentation !== "theater") {
          _exitOwnedFullscreen(root);
        }
      })
      .catch(() => {});
  } catch {
    // Window theater is also the supported fallback for synchronous refusal.
  }
}
function useFullscreenOwnership(
  owner: Owner,
  setIsFullscreen: (isFullscreen: boolean) => void,
): void {
  useLayoutEffect(() => {
    owner.isMounted = true;
    const onFullscreenChange = () => {
      setIsFullscreen(
        owner.root !== null && document.fullscreenElement === owner.root,
      );
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      owner.isMounted = false;
      if (owner.presentation === "theater") {
        owner.onBeforeExit();
      }
      _exitOwnedFullscreen(owner.root);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [owner, setIsFullscreen]);
}

function usePageScrollRestoration(
  owner: Owner,
  presentation: ItemPresentation,
): void {
  useLayoutEffect(() => {
    const position = owner.scrollPosition;
    if (presentation === "page" && position !== undefined) {
      owner.scrollPosition = undefined;
      if (window.scrollX !== position.left || window.scrollY !== position.top) {
        window.scrollTo({ ...position, behavior: "instant" });
      }
    }
  }, [owner, presentation]);
}

function _getActionsFromOwner({
  owner,
  hostRef,
  setPresentation,
}: Readonly<{
  owner: Owner;
  hostRef: RefObject<HTMLDivElement | null>;
  setPresentation: (presentation: ItemPresentation) => void;
}>): Pick<TheaterMode, "enter" | "exit" | "toggleFullscreen"> {
  return {
    enter: () => {
      if (owner.presentation !== "theater") {
        owner.scrollPosition = { left: window.scrollX, top: window.scrollY };
      }
      owner.root = hostRef.current;
      owner.presentation = "theater";
      setPresentation("theater");
      _requestFullscreen(owner);
    },
    exit: () => {
      owner.onBeforeExit();
      owner.presentation = "page";
      setPresentation("page");
      _exitOwnedFullscreen(owner.root);
    },
    toggleFullscreen: () => {
      if (document.fullscreenElement === owner.root && owner.root !== null) {
        _exitOwnedFullscreen(owner.root);
      } else {
        _requestFullscreen(owner);
      }
    },
  };
}

/** Entry preserves browser activation; Back pauses before releasing the stage. */
export function useTheaterMode({
  onBeforeExit,
}: Readonly<{ onBeforeExit: () => void }>): TheaterMode {
  const hostRef = useRef<HTMLDivElement>(null);
  const playbackPreferences = useRef({ isMuted: false });
  const [presentation, setPresentation] = useState<ItemPresentation>("page");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const owner = useRef<Owner>({
    root: null,
    presentation: "page",
    isMounted: true,
    onBeforeExit,
    scrollPosition: undefined,
  }).current;
  owner.onBeforeExit = onBeforeExit;
  useFullscreenOwnership(owner, setIsFullscreen);
  usePageScrollRestoration(owner, presentation);
  return {
    hostRef,
    presentation,
    isFullscreen,
    playbackPreferences,
    ..._getActionsFromOwner({ owner, hostRef, setPresentation }),
  };
}
