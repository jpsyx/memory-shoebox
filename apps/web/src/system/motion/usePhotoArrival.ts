import { useLayoutEffect, useRef, type RefObject } from "react";
import {
  arrivePhotoTransition,
  preparePhotoArrival,
} from "./photoTransition/photoTransition";

/** Wait for real pixels and restored scroll without delaying route navigation. */
export function usePhotoArrival<T extends HTMLElement>(
  itemId: string | undefined,
  imageUrl: string,
  options?: { reference: RefObject<T | null>; isReady: boolean },
): RefObject<T | null> {
  const ownReference = useRef<T>(null);
  const reference = options?.reference ?? ownReference;
  const isReady = options?.isReady ?? true;
  useLayoutEffect(() => {
    const element = reference.current;
    if (!element || !itemId) {
      return;
    }
    return preparePhotoArrival(element, itemId);
  }, [itemId, reference]);
  useLayoutEffect(() => {
    const element = reference.current;
    const image = element?.querySelector("img");
    if (!element || !image || !itemId || !isReady) {
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
  }, [itemId, imageUrl, reference, isReady]);
  return reference;
}
