import { flushSync } from "react-dom";
import { hasReducedMotion } from "../paperMotionHelpers";
let currentTransition: ViewTransition | undefined;

/** Snapshot a local arrangement change without changing its save semantics. */
export function animatePaperChange(change: () => void): void {
  if (
    hasReducedMotion() ||
    typeof document.startViewTransition !== "function"
  ) {
    change();
    return;
  }
  currentTransition?.skipTransition();
  const transition = document.startViewTransition(() => {
    flushSync(change);
  });
  currentTransition = transition;
  void transition.ready.catch(() => {});
  void transition.finished.then(
    () => {
      if (currentTransition === transition) {
        currentTransition = undefined;
      }
    },
    () => {
      if (currentTransition === transition) {
        currentTransition = undefined;
      }
    },
  );
}
