import {
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { MediaRef, MediaSource } from "@memory-shoebox/shared";
import { usePhotoArrival } from "@/system/motion/usePhotoArrival";
import { MediaLoadingContext } from "./MediaLoadingContext";
import { PhotoReadinessContext } from "./PhotoReadinessContext";
import { getPhotoCandidateFromViewport } from "./getPhotoCandidateFromViewport";
import {
  getPhotoCandidatesFromMedia,
  type PhotoViewport,
} from "./photoViewport";
import { usePhotoViewport } from "./usePhotoViewport";
import { useMediaSourceOwnership } from "./useMediaSourceOwnership";

/** Exact selected pixels, with decode guarded against stale asynchronous work. */
export type SelectedPhoto = {
  frame: RefObject<HTMLDivElement | null>;
  source: MediaSource | undefined;
  viewport: PhotoViewport | undefined;
  sourceKey: string;
  isReady: boolean;
  onLoad: (image: HTMLImageElement) => Promise<void>;
};

function usePhotoDecode(
  options: Readonly<{
    itemId: string;
    source: MediaSource | undefined;
    viewport: PhotoViewport | undefined;
    sourceEpoch?: number;
  }>,
): Pick<SelectedPhoto, "sourceKey" | "isReady" | "onLoad"> {
  const { itemId, source, viewport } = options;
  const sourceKey = `${itemId}:${source?.url}:${viewport?.devicePixelRatio}:${options.sourceEpoch ?? 0}`;
  const currentKey = useRef(sourceKey);
  currentKey.current = sourceKey;
  const [decodedKey, setDecodedKey] = useState<string>();
  const isReady = decodedKey === sourceKey;
  const onReady = useContext(PhotoReadinessContext);
  useLayoutEffect(() => {
    onReady?.(
      isReady && viewport !== undefined
        ? { itemId, sourceKey, viewport, photosReady: true }
        : undefined,
    );
    return () => {
      onReady?.(undefined);
    };
  }, [isReady, itemId, sourceKey, viewport, onReady]);
  const onLoad = async (image: HTMLImageElement) => {
    try {
      await image.decode?.();
      if (
        currentKey.current === sourceKey &&
        (image.currentSrc || image.src) === source?.url
      ) {
        setDecodedKey(sourceKey);
      }
    } catch {
      /* Keep the selected thumbnail when decoding fails. */
    }
  };
  return { sourceKey, isReady, onLoad };
}

/** Measures before requesting display bytes and shares selection with warming. */
export function useSelectedPhoto(
  options: Readonly<{ media: MediaRef; itemId: string; sourceEpoch?: number }>,
): SelectedPhoto {
  const { media, itemId } = options;
  const frame = usePhotoArrival<HTMLDivElement>(itemId, media.thumb?.url ?? "");
  const resources = useContext(MediaLoadingContext);
  const viewport = usePhotoViewport(frame, resources?.navigation.viewport);
  const source =
    viewport === undefined
      ? undefined
      : getPhotoCandidateFromViewport({
          ...viewport,
          candidates: getPhotoCandidatesFromMedia(media),
        });
  useLayoutEffect(() => {
    if (resources !== undefined && viewport !== undefined) {
      resources.navigation.viewport = viewport;
    }
  }, [resources, viewport]);
  useMediaSourceOwnership({ itemId, source });
  return {
    frame,
    source,
    viewport,
    ...usePhotoDecode({
      itemId,
      source,
      viewport,
      sourceEpoch: options.sourceEpoch,
    }),
  };
}
