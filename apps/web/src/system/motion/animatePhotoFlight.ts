import {
  getPaperGeometryFromElement,
  PAPER_EASE,
  type PaperGeometry,
} from "./paperMotionHelpers";
import { updatePhotoFlightFromElement } from "./photoFlightHelpers";

type FlightOptions = {
  target: HTMLElement;
  source: PaperGeometry;
  layer: HTMLDivElement;
  onFinished: () => void;
};

function _getPoseFromLayer(layer: HTMLDivElement): Keyframe {
  return {
    width: layer.style.width,
    height: layer.style.height,
    padding: layer.style.padding,
    boxShadow: layer.style.boxShadow,
    backgroundColor: layer.style.backgroundColor,
    transform: layer.style.transform,
  };
}

/** Fly the retained print, keeping its pixels proportional through letterboxing. */
export function animatePhotoFlight({
  target,
  source,
  layer,
  onFinished,
}: Readonly<FlightOptions>): () => void {
  const destination = getPaperGeometryFromElement(target);
  const departure = {
    ..._getPoseFromLayer(layer),
    transform: `translate(calc(-50% + ${source.centerX - destination.centerX}px), calc(-50% + ${source.centerY - destination.centerY}px)) rotate(${source.angle}deg)`,
  };
  updatePhotoFlightFromElement(layer, target, destination);
  layer.dataset.photoFlightPhase = "moving";
  const animation = layer.animate([departure, _getPoseFromLayer(layer)], {
    duration: target.dataset.photoSurface === "viewer" ? 420 : 300,
    easing: PAPER_EASE,
  });
  let isReleased = false;
  const release = () => {
    if (isReleased) {
      return;
    }
    isReleased = true;
    animation.cancel();
    onFinished();
  };
  void animation.finished.then(release, release);
  return release;
}
