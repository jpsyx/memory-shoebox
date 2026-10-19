import {
  getPaperGeometryFromElement,
  PAPER_EASE,
  type PaperGeometry,
} from "./paperMotionHelpers";
import classes from "./motion.module.css";

/** The temporary layer contains only a photograph and never an active control. */
function _makeFlightFromTarget(
  target: HTMLElement,
  geometry: PaperGeometry,
): HTMLDivElement {
  const layer = document.createElement("div");
  layer.className = classes.photoFlight ?? "";
  layer.dataset.photoFlight = "true";
  layer.setAttribute("aria-hidden", "true");
  layer.inert = true;
  const frameStyle = getComputedStyle(target);
  Object.assign(layer.style, {
    left: `${geometry.centerX - geometry.width / 2}px`,
    top: `${geometry.centerY - geometry.height / 2}px`,
    width: `${geometry.width}px`,
    height: `${geometry.height}px`,
    boxSizing: "border-box",
    padding: frameStyle.padding,
    backgroundColor: frameStyle.backgroundColor,
    boxShadow: frameStyle.boxShadow,
  });
  const targetImage = target.querySelector("img")!;
  const image = targetImage.cloneNode() as HTMLImageElement;
  image.src = targetImage.currentSrc || targetImage.src;
  image.removeAttribute("srcset");
  image.removeAttribute("sizes");
  image.style.backgroundColor = getComputedStyle(targetImage).backgroundColor;
  image.removeAttribute("loading");
  image.alt = "";
  layer.append(image);
  document.body.append(layer);
  return layer;
}

/** Fly one inert print; every completion and cancellation restores the real one. */
export function animatePhotoFlight(
  target: HTMLElement,
  source: PaperGeometry,
  onFinished: () => void,
): () => void {
  const destination = getPaperGeometryFromElement(target);
  const layer = _makeFlightFromTarget(target, destination);
  target.dataset.photoArriving = "true";
  const animation = layer.animate(
    [
      {
        transform: `translate(${source.centerX - destination.centerX}px, ${source.centerY - destination.centerY}px) rotate(${source.angle}deg) scale(${source.width / destination.width}, ${source.height / destination.height})`,
      },
      { transform: `rotate(${destination.angle}deg) scale(1)` },
    ],
    { duration: 560, easing: PAPER_EASE },
  );
  let isReleased = false;
  const release = () => {
    if (isReleased) {
      return;
    }
    isReleased = true;
    delete target.dataset.photoArriving;
    layer.remove();
    animation.cancel();
    onFinished();
  };
  void animation.finished.then(release, release);
  return release;
}
