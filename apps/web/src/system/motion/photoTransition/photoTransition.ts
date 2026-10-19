import { animatePhotoFlight } from "../animatePhotoFlight";
import { makePhotoFlightFromElement } from "../photoFlightHelpers";
import {
  getPaperGeometryFromElement,
  hasReducedMotion,
  type PaperGeometry,
} from "../paperMotionHelpers";

type PhotoJourney = {
  itemId: string;
  surface: string;
  destinationPath: string;
  geometry: PaperGeometry;
  source: HTMLElement;
  layer: HTMLDivElement;
  targets: Set<HTMLElement>;
  destination?: HTMLElement;
  releaseFlight?: () => void;
};
let journey: PhotoJourney | undefined;
let expiry: ReturnType<typeof setTimeout> | undefined;

function _onScrollKey(event: KeyboardEvent): void {
  if (
    [
      "ArrowUp",
      "ArrowDown",
      "PageUp",
      "PageDown",
      "Home",
      "End",
      " ",
      "Escape",
    ].includes(event.key)
  ) {
    clearPhotoTransition();
  }
}

function _observeInterruption(): void {
  window.addEventListener("resize", clearPhotoTransition);
  window.addEventListener("wheel", clearPhotoTransition, { passive: true });
  window.addEventListener("touchmove", clearPhotoTransition, { passive: true });
  window.addEventListener("keydown", _onScrollKey);
}

/** Dispose all retained pixels and reveal real frames on every terminal path. */
export function clearPhotoTransition(): void {
  clearTimeout(expiry);
  const previous = journey;
  journey = undefined;
  if (previous === undefined) {
    return;
  }
  previous.releaseFlight?.();
  previous.layer.remove();
  delete previous.source.dataset.photoArriving;
  previous.targets.forEach((target) => {
    delete target.dataset.photoArriving;
  });
  window.removeEventListener("resize", clearPhotoTransition);
  window.removeEventListener("scroll", clearPhotoTransition, true);
  window.removeEventListener("wheel", clearPhotoTransition);
  window.removeEventListener("touchmove", clearPhotoTransition);
  window.removeEventListener("keydown", _onScrollKey);
}

/** Keep the clicked print visible across navigation without fetching any media. */
export function stagePhotoTransition(
  element: HTMLElement,
  itemId: string,
): void {
  clearPhotoTransition();
  const image = element.querySelector("img");
  const surface = element.dataset.photoSurface;
  if (
    !image?.complete ||
    !image.naturalWidth ||
    !surface ||
    hasReducedMotion() ||
    typeof element.animate !== "function"
  ) {
    return;
  }
  const geometry = getPaperGeometryFromElement(element);
  if (geometry.width <= 0 || geometry.height <= 0) {
    return;
  }
  journey = {
    itemId,
    surface,
    destinationPath: surface === "pile" ? `/items/${itemId}` : "/",
    geometry,
    source: element,
    layer: makePhotoFlightFromElement(element, geometry),
    targets: new Set(),
  };
  element.dataset.photoArriving = "true";
  expiry = setTimeout(clearPhotoTransition, 1500);
  _observeInterruption();
}

function _matchesDestination(target: HTMLElement, itemId: string): boolean {
  return (
    journey !== undefined &&
    journey.itemId === itemId &&
    journey.surface !== target.dataset.photoSurface &&
    location.pathname === journey.destinationPath
  );
}

/** Hide matching previews and final frames in the layout effect, before paint. */
export function preparePhotoArrival(
  target: HTMLElement,
  itemId: string,
): () => void {
  if (!_matchesDestination(target, itemId)) {
    return () => {};
  }
  const current = journey!;
  target.dataset.photoArriving = "true";
  current.targets.add(target);
  return () => {
    if (journey !== current) {
      return;
    }
    if (current.destination === target) {
      clearPhotoTransition();
    } else {
      delete target.dataset.photoArriving;
      current.targets.delete(target);
    }
  };
}

/** Route changes away from the intended destination retire the retained print. */
export function reconcilePhotoTransition(href: string): void {
  if (
    journey &&
    new URL(href, location.origin).pathname !== journey.destinationPath
  ) {
    clearPhotoTransition();
  }
}

function _finishPhotoArrival(current: PhotoJourney): void {
  if (journey !== current) {
    return;
  }
  const target = current.destination;
  clearPhotoTransition();
  if (
    current.surface === "viewer" &&
    target?.isConnected &&
    document.activeElement === document.body
  ) {
    target.focus({ preventScroll: true });
  }
}

/** Move the one retained print only after the matching final pixels commit. */
export function arrivePhotoTransition(
  target: HTMLElement,
  itemId: string,
): () => void {
  if (!_matchesDestination(target, itemId) || journey?.destination) {
    return () => {};
  }
  const current = journey!;
  const bounds = target.getBoundingClientRect();
  if (
    hasReducedMotion() ||
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    bounds.bottom <= 0 ||
    bounds.top >= window.innerHeight
  ) {
    clearPhotoTransition();
    return () => {};
  }
  preparePhotoArrival(target, itemId);
  current.destination = target;
  clearTimeout(expiry);
  try {
    current.releaseFlight = animatePhotoFlight({
      target,
      source: current.geometry,
      layer: current.layer,
      onFinished: () => {
        _finishPhotoArrival(current);
      },
    });
    window.addEventListener("scroll", clearPhotoTransition, true);
  } catch {
    clearPhotoTransition();
  }
  return () => {
    if (journey === current) {
      clearPhotoTransition();
    }
  };
}

/** The in-app back link can pick up the currently displayed full-size print. */
export function stagePhotoReturn(): void {
  const element = document.querySelector<HTMLElement>(
    '[data-photo-surface="viewer"]',
  );
  const itemId = element?.dataset.photoItem;
  if (element && itemId) {
    stagePhotoTransition(element, itemId);
  }
}
