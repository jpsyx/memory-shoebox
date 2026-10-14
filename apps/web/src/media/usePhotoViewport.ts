import { useLayoutEffect, useState, type RefObject } from "react";
import {
  getPhotoViewportFromElement,
  type PhotoViewport,
} from "./photoViewport";

/** Re-measures the actual frame and follows monitor/zoom DPR changes. */
export function usePhotoViewport(
  reference: RefObject<HTMLElement | null>,
  initial?: PhotoViewport,
  measureParent = false,
): PhotoViewport | undefined {
  const [viewport, setViewport] = useState<PhotoViewport | undefined>(initial);
  useLayoutEffect(() => {
    let resolution: MediaQueryList;
    const element = measureParent
      ? reference.current?.parentElement
      : reference.current;
    const measure = () => {
      setViewport((previous) => {
        const measured = getPhotoViewportFromElement(element);
        return JSON.stringify(previous) === JSON.stringify(measured)
          ? previous
          : measured;
      });
      resolution?.removeEventListener("change", measure);
      resolution = window.matchMedia(
        `(resolution: ${window.devicePixelRatio}dppx)`,
      );
      resolution.addEventListener("change", measure);
    };
    const observer = new ResizeObserver(measure);
    if (element != null) {
      observer.observe(element);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      resolution.removeEventListener("change", measure);
    };
  }, [reference, measureParent]);
  return viewport;
}
