import type { PaperGeometry } from "./paperMotionHelpers";
import classes from "./motion.module.css";

/** Match an inert frame to the current pixels and paper of a real print. */
export function updatePhotoFlightFromElement(
  layer: HTMLDivElement,
  target: HTMLElement,
  geometry: Readonly<PaperGeometry>,
): void {
  const frameStyle = getComputedStyle(target);
  Object.assign(layer.style, {
    left: `${geometry.centerX}px`,
    top: `${geometry.centerY}px`,
    width: `${geometry.width}px`,
    height: `${geometry.height}px`,
    padding: frameStyle.padding,
    backgroundColor: frameStyle.backgroundColor,
    boxShadow: frameStyle.boxShadow,
    transform: `translate(-50%, -50%) rotate(${geometry.angle}deg)`,
  });
  const targetImage = target.querySelector("img")!;
  const image = document.createElement("img");
  image.src = targetImage.currentSrc || targetImage.src;
  image.style.backgroundColor = getComputedStyle(targetImage).backgroundColor;
  image.alt = "";
  layer.replaceChildren(image);
}

/** Retain only the clicked photograph, with no active controls or duplicate ID. */
export function makePhotoFlightFromElement(
  source: HTMLElement,
  geometry: Readonly<PaperGeometry>,
): HTMLDivElement {
  const layer = document.createElement("div");
  layer.className = classes.photoFlight ?? "";
  layer.dataset.photoFlight = "true";
  layer.dataset.photoFlightPhase = "holding";
  layer.setAttribute("aria-hidden", "true");
  layer.inert = true;
  updatePhotoFlightFromElement(layer, source, geometry);
  document.body.append(layer);
  return layer;
}
