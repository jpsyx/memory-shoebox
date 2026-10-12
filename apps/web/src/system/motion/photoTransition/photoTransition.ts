import { animatePhotoFlight } from "../animatePhotoFlight";
import {
  getPaperGeometryFromElement,
  hasReducedMotion,
  type PaperGeometry,
} from "../paperMotionHelpers";

type PhotoSnapshot = {
  itemId: string;
  surface: string;
  destinationPath: string;
  geometry: PaperGeometry;
};
let pendingPhoto: PhotoSnapshot | undefined;
let expiry: ReturnType<typeof setTimeout> | undefined;
let releaseFlight: (() => void) | undefined;

/** Dispose presentation state on interruption, expiry or membership change. */
export function clearPhotoTransition(): void {
  clearTimeout(expiry);
  pendingPhoto = undefined;
  const release = releaseFlight;
  releaseFlight = undefined;
  release?.();
}

/** Capture an intentional open only; motion never fetches or counts an item. */
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
  pendingPhoto = {
    itemId,
    surface,
    destinationPath: surface === "pile" ? `/items/${itemId}` : "/",
    geometry: getPaperGeometryFromElement(element),
  };
  expiry = setTimeout(clearPhotoTransition, 1500);
}

/** Consume only the matching, visible destination after its image has loaded. */
export function arrivePhotoTransition(
  target: HTMLElement,
  itemId: string,
): () => void {
  const source = pendingPhoto;
  const bounds = target.getBoundingClientRect();
  if (
    !source ||
    source.itemId !== itemId ||
    source.surface === target.dataset.photoSurface ||
    location.pathname !== source.destinationPath
  ) {
    return () => {};
  }
  pendingPhoto = undefined;
  clearTimeout(expiry);
  if (
    hasReducedMotion() ||
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    bounds.bottom <= 0 ||
    bounds.top >= window.innerHeight
  ) {
    return () => {};
  }
  const release = animatePhotoFlight(target, source.geometry, () => {
    releaseFlight = undefined;
    if (
      source.surface === "viewer" &&
      target.isConnected &&
      document.activeElement === document.body
    ) {
      target.focus({ preventScroll: true });
    }
  });
  releaseFlight = release;
  return release;
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
