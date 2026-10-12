import { useLayoutEffect, useRef, type RefObject } from "react";
import { arrivePhotoTransition } from "./photoTransition/photoTransition";

/** Wait for real pixels and restored scroll without delaying route navigation. */
export function usePhotoArrival<T extends HTMLElement>(
  itemId: string | undefined,
  imageUrl: string,
): RefObject<T | null> {
  const reference = useRef<T>(null);
  useLayoutEffect(() => {
    const element = reference.current;
    const image = element?.querySelector("img");
    if (!element || !image || !itemId) {
      return;
    }
    let frame = 0;
    let release: (() => void) | undefined;
    const onLoad = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (image.naturalWidth > 0) {
          release = arrivePhotoTransition(element, itemId);
        }
      });
    };
    if (image.complete) {
      onLoad();
    }
    image.addEventListener("load", onLoad);
    return () => {
      cancelAnimationFrame(frame);
      image.removeEventListener("load", onLoad);
      release?.();
    };
  }, [itemId, imageUrl]);
  return reference;
}
