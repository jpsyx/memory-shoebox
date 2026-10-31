import { useLayoutEffect, useRef, type RefObject } from "react";
import {
  arrivePhotoTransition,
  preparePhotoArrival,
} from "./photoTransition/photoTransition";

/** Viewer layout starts the flight; returning prints wait for their pixels. */
export function usePhotoArrival<T extends HTMLElement>(
  itemId: string | undefined,
  imageUrl: string,
  options?: {
    reference: RefObject<T | null>;
    isReady: boolean;
    isLayoutReady?: boolean;
  },
): RefObject<T | null> {
  const ownReference = useRef<T>(null);
  const reference = options?.reference ?? ownReference;
  const isLayoutReady = options?.isLayoutReady;
  const isReady =
    isLayoutReady === undefined ? (options?.isReady ?? true) : true;
  const pixelKey = isLayoutReady === undefined ? imageUrl : undefined;
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
    if (element && itemId && isLayoutReady !== undefined) {
      if (!isLayoutReady) {
        return;
      }
      const frame = requestAnimationFrame(() => {
        return arrivePhotoTransition(element, itemId);
      });
      return () => {
        return cancelAnimationFrame(frame);
      };
    }
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
  }, [itemId, pixelKey, reference, isReady, isLayoutReady]);
  return reference;
}
