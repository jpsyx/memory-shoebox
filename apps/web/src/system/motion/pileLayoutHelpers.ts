import { hasReducedMotion, PAPER_EASE } from "./paperMotionHelpers";

type Position = { left: number; top: number };
/** Positions belong to DOM identity, so unrelated or removed prints never move. */
export type PileLayout = ReadonlyMap<HTMLElement, Position>;
const animations = new WeakMap<HTMLElement, Animation>();

/** Remember neighboring prints before a stack changes its footprint. */
export function getPileLayoutFromElement(element: HTMLElement): PileLayout {
  return new Map(
    Array.from(element.parentElement?.children ?? [])
      .filter((child): child is HTMLElement => {
        return child instanceof HTMLElement && child !== element;
      })
      .map((child) => {
        const bounds = child.getBoundingClientRect();
        return [
          child,
          { left: bounds.left + scrollX, top: bounds.top + scrollY },
        ] as const;
      }),
  );
}

/** Translation is independent of the seeded resting rotation on each print. */
export function animatePileLayout(layout: PileLayout): void {
  if (hasReducedMotion()) {
    return;
  }
  layout.forEach((position, element) => {
    if (!element.isConnected || typeof element.animate !== "function") {
      return;
    }
    animations.get(element)?.cancel();
    const bounds = element.getBoundingClientRect();
    const horizontal = position.left - bounds.left - scrollX;
    const vertical = position.top - bounds.top - scrollY;
    if (Math.abs(horizontal) + Math.abs(vertical) < 1) {
      return;
    }
    const animation = element.animate(
      [
        { translate: `${horizontal}px ${vertical}px` },
        { translate: "0px 0px" },
      ],
      { duration: 460, easing: PAPER_EASE },
    );
    animations.set(element, animation);
    void animation.finished.catch(() => {});
  });
}
