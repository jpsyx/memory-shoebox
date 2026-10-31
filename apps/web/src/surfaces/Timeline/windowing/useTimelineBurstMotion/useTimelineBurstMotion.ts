import {
  useLayoutEffect,
  useRef,
  type MouseEvent,
  type RefObject,
} from "react";
import {
  animateBurstPhotos,
  getBurstFramesFromElement,
  getBurstOriginFromElement,
} from "@/system/motion/burstMotionHelpers";

type FanMotion = {
  origins: Map<string, ReturnType<typeof getBurstOriginFromElement>>;
  groups: Set<HTMLElement>;
  animations: Map<HTMLElement, Animation[]>;
};

function _cancelGroup(state: FanMotion, group: HTMLElement): void {
  state.animations.get(group)?.forEach((animation) => {
    animation.cancel();
  });
  state.animations.delete(group);
}

function _updateGroups(state: FanMotion, root: HTMLElement | null): void {
  const groups = new Set(
    root?.querySelectorAll<HTMLElement>("[data-timeline-fan]") ?? [],
  );
  state.groups.forEach((group) => {
    if (!groups.has(group)) {
      _cancelGroup(state, group);
    }
  });
  groups.forEach((group) => {
    if (
      state.animations.has(group) ||
      !group.querySelector("[data-photo-surface]")
    ) {
      return;
    }
    const origin = state.origins.get(group.dataset.timelineFan!);
    if (origin) {
      state.animations.set(group, animateBurstPhotos(group, origin, false));
    }
  });
  state.groups = groups;
}

function _capture(state: FanMotion, event: MouseEvent<HTMLDivElement>): void {
  const cover = (event.target as HTMLElement).closest<HTMLElement>(
    "[data-burst-stack]",
  );
  const photo = cover?.querySelector<HTMLElement>("[data-photo-surface]");
  if (cover?.dataset.burstId && photo) {
    if (state.origins.size > 64) {
      state.origins.clear();
    }
    state.origins.set(cover.dataset.burstId, getBurstOriginFromElement(photo));
  }
}

function _collapse(
  state: FanMotion,
  burstId: string,
  onCollapsed: () => void,
): void {
  const group = [...state.groups].find((candidate) => {
    return candidate.dataset.timelineFan === burstId;
  });
  if (!group) {
    onCollapsed();
    return;
  }
  const pose = getBurstFramesFromElement(group);
  _cancelGroup(state, group);
  const animations = animateBurstPhotos(
    group,
    state.origins.get(burstId) ?? getBurstOriginFromElement(group),
    true,
    pose,
  );
  state.animations.set(group, animations);
  if (animations.length === 0) {
    onCollapsed();
    return;
  }
  void Promise.allSettled(
    animations.map((animation) => {
      return animation.finished;
    }),
  ).then(() => {
    if (group.isConnected && state.animations.get(group) === animations) {
      onCollapsed();
    }
  });
}

/** Carry the cover pose across replacement by independently virtualized rows. */
export function useTimelineBurstMotion(
  element: RefObject<HTMLDivElement | null>,
): {
  capture: (event: MouseEvent<HTMLDivElement>) => void;
  collapse: (burstId: string, onCollapsed: () => void) => void;
} {
  const state = useRef<FanMotion>({
    origins: new Map(),
    groups: new Set(),
    animations: new Map(),
  });
  useLayoutEffect(() => {
    _updateGroups(state.current, element.current);
  });
  useLayoutEffect(() => {
    const current = state.current;
    return () => {
      current.groups.forEach((group) => {
        _cancelGroup(current, group);
      });
      current.groups.clear();
    };
  }, []);
  return {
    capture: (event) => {
      _capture(state.current, event);
    },
    collapse: (burstId, onCollapsed) => {
      _collapse(state.current, burstId, onCollapsed);
    },
  };
}
