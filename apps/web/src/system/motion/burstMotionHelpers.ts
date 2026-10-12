import { hasReducedMotion, PAPER_EASE } from "./paperMotionHelpers";

type Origin = { x: number; y: number };

/** A burst keeps its center on the page even if the reader scrolls while loading. */
export function getBurstOriginFromElement(element: HTMLElement): Origin {
  const bounds = element.getBoundingClientRect();
  return {
    x: bounds.left + bounds.width / 2 + scrollX,
    y: bounds.top + bounds.height / 2 + scrollY,
  };
}

/** Individual photos unfold from one stack, with the total stagger bounded. */
export function animateBurstPhotos(
  root: HTMLElement,
  origin: Origin,
  isClosing: boolean,
  startingFrames?: ReadonlyMap<HTMLElement, Keyframe>,
): Animation[] {
  const reduced = hasReducedMotion();
  return Array.from(
    root.querySelectorAll<HTMLElement>('[data-photo-surface="pile"]'),
  )
    .slice(0, 16)
    .filter((photo) => {
      return typeof photo.animate === "function";
    })
    .map((photo, index) => {
      const bounds = photo.getBoundingClientRect();
      const horizontal = origin.x - (bounds.left + bounds.width / 2 + scrollX);
      const vertical = origin.y - (bounds.top + bounds.height / 2 + scrollY);
      const gathered: Keyframe = reduced
        ? { opacity: 0 }
        : {
            translate: `${horizontal}px ${vertical}px`,
            scale: "0.72",
            rotate: `${index % 2 === 0 ? -7 : 7}deg`,
            opacity: 0,
          };
      const resting: Keyframe = reduced
        ? { opacity: 1 }
        : {
            translate: "0px 0px",
            scale: "1",
            rotate: "0deg",
            opacity: 1,
          };
      const animation = photo.animate(
        isClosing
          ? [startingFrames?.get(photo) ?? resting, gathered]
          : [gathered, resting],
        {
          duration: reduced ? 120 : isClosing ? 220 : 560,
          delay: reduced || isClosing ? 0 : Math.min(index, 7) * 22,
          easing: PAPER_EASE,
          fill: "both",
        },
      );
      void animation.finished.then(
        () => {
          if (!isClosing) {
            animation.cancel();
          }
        },
        () => {},
      );
      return animation;
    });
}

/** Preserve in-flight presentation before cancelling an unfolding fan. */
export function getBurstFramesFromElement(
  root: HTMLElement,
): Map<HTMLElement, Keyframe> {
  return new Map(
    Array.from(
      root.querySelectorAll<HTMLElement>('[data-photo-surface="pile"]'),
    ).map((photo) => {
      const style = getComputedStyle(photo);
      return [
        photo,
        {
          translate: style.translate,
          scale: style.scale,
          rotate: style.rotate,
          opacity: style.opacity,
        },
      ];
    }),
  );
}
