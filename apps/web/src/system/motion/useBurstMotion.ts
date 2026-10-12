import { useLayoutEffect, useRef, type RefObject } from "react";
import {
  animateBurstPhotos,
  getBurstOriginFromElement,
  getBurstFramesFromElement,
} from "./burstMotionHelpers";
import {
  animatePileLayout,
  getPileLayoutFromElement,
  type PileLayout,
} from "./pileLayoutHelpers";

type BurstState = {
  layout: PileLayout;
  origin: ReturnType<typeof getBurstOriginFromElement> | undefined;
  wasFanned: boolean;
  shouldRestoreFocus: boolean;
  isClosing: boolean;
  generation: number;
  animations: Animation[];
};

function _cancel(state: BurstState): void {
  state.generation += 1;
  state.animations.forEach((animation) => {
    return animation.cancel();
  });
  state.animations = [];
  state.isClosing = false;
}

function _capture(root: HTMLDivElement | null, state: BurstState): void {
  if (!root || state.isClosing) {
    return;
  }
  state.layout = getPileLayoutFromElement(root);
  const photo = root.querySelector<HTMLElement>('[data-photo-surface="pile"]');
  if (photo) {
    state.origin = getBurstOriginFromElement(photo);
  }
}

function _collapse(options: {
  root: HTMLDivElement | null;
  state: BurstState;
  onCollapsed: () => void;
}): void {
  const { root, state, onCollapsed } = options;
  if (!root || state.isClosing) {
    return;
  }
  _capture(root, state);
  const startingFrames = getBurstFramesFromElement(root);
  state.shouldRestoreFocus = root.contains(document.activeElement);
  _cancel(state);
  const photo = root.querySelector<HTMLElement>('[data-photo-surface="pile"]');
  state.animations = animateBurstPhotos(
    root,
    getBurstOriginFromElement(photo ?? root),
    true,
    startingFrames,
  );
  if (state.animations.length === 0) {
    onCollapsed();
    return;
  }
  state.isClosing = true;
  root.inert = true;
  const generation = state.generation;
  void Promise.allSettled(
    state.animations.map((animation) => {
      return animation.finished;
    }),
  ).then(() => {
    if (!root.isConnected || generation !== state.generation) {
      return;
    }
    state.isClosing = false;
    root.inert = false;
    onCollapsed();
  });
}

function _updateFan(options: {
  root: HTMLDivElement;
  current: BurstState;
  isFanned: boolean;
}): void {
  const { root, current, isFanned } = options;
  _cancel(current);
  root.inert = false;
  animatePileLayout(current.layout);
  if (isFanned) {
    current.animations = animateBurstPhotos(
      root,
      current.origin ?? getBurstOriginFromElement(root),
      false,
    );
  } else if (
    current.shouldRestoreFocus &&
    document.activeElement === document.body
  ) {
    root.querySelector("button")?.focus({ preventScroll: true });
  }
  current.shouldRestoreFocus = false;
  current.wasFanned = isFanned;
}

/** Retain the fan during its exit, then restore focus to its cover. */
export function useBurstMotion(isFanned: boolean): {
  reference: RefObject<HTMLDivElement | null>;
  capture: () => void;
  collapse: (onCollapsed: () => void) => void;
} {
  const reference = useRef<HTMLDivElement>(null);
  const state = useRef<BurstState>({
    layout: new Map(),
    origin: undefined,
    wasFanned: false,
    shouldRestoreFocus: false,
    isClosing: false,
    generation: 0,
    animations: [],
  });
  useLayoutEffect(() => {
    const root = reference.current;
    const current = state.current;
    if (!root || isFanned === current.wasFanned) {
      return;
    }
    _updateFan({ root, current, isFanned });
  }, [isFanned]);
  useLayoutEffect(() => {
    const current = state.current;
    return () => {
      _cancel(current);
    };
  }, []);
  return {
    reference,
    capture: () => {
      _capture(reference.current, state.current);
    },
    collapse: (onCollapsed) => {
      _collapse({ root: reference.current, state: state.current, onCollapsed });
    },
  };
}
