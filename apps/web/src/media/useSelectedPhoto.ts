import { usePhotoArrival } from "@/system/motion/usePhotoArrival";
import type { MediaRef, MediaSource } from "@memory-shoebox/shared";
import {
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { MediaLoadingContext } from "./MediaLoadingContext";
import { PhotoReadinessContext } from "./PhotoReadinessContext";
import type { DecodedPhotoSnapshot } from "./createMediaNavigation";
import { getPhotoCandidateFromViewport } from "./getPhotoCandidateFromViewport/getPhotoCandidateFromViewport";
import {
  getPhotoCandidatesFromMedia,
  type PhotoViewport,
} from "./photoViewportHelpers";
import { useMediaSourceOwnership } from "./useMediaSourceOwnership";
import { usePhotoViewport } from "./usePhotoViewport";
type SelectedPhotoOptions = {
  media: MediaRef;
  itemId: string;
  sourceEpoch?: number;
  presentation?: "preview" | "selected";
};

type PhotoDecodeOptions = {
  itemId: string;
  source: MediaSource | undefined;
  viewport: PhotoViewport | undefined;
  sourceEpoch?: number;
  onDecoded: () => void;
};

/**
 * Exact selected pixels, with decode guarded against stale asynchronous work.
 */
export type SelectedPhoto = {
  frame: RefObject<HTMLDivElement | null>;
  source: MediaSource | undefined;
  viewport: PhotoViewport | undefined;
  sourceKey: string;
  isReady: boolean;
  onLoad: (image: HTMLImageElement) => Promise<void>;
  image: RefObject<HTMLImageElement | null>;
  handoff: DecodedPhotoSnapshot | undefined;
  discardHandoff: () => void;
  recheckHandoff: () => void;
};

function usePhotoDecode(
  options: Readonly<PhotoDecodeOptions>,
): Pick<SelectedPhoto, "sourceKey" | "isReady" | "onLoad" | "image"> {
  const { itemId, source, viewport } = options;
  const sourceKey = `${itemId}:${source?.renditionId}:${source?.url}:${viewport?.devicePixelRatio}:${options.sourceEpoch ?? 0}`;
  const image = useRef<HTMLImageElement>(null);
  const mounted = useRef(false);
  useLayoutEffect(function trackSelectedPhotoMount() {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const currentKey = useRef(sourceKey);
  currentKey.current = sourceKey;
  const [decodedKey, setDecodedKey] = useState<string>();
  const isReady = decodedKey === sourceKey;
  const onReady = useContext(PhotoReadinessContext);
  useLayoutEffect(
    function publishSelectedPhotoReadiness() {
      onReady?.(
        isReady && viewport !== undefined
          ? { itemId, sourceKey, viewport, photosReady: true }
          : undefined,
      );
      return () => {
        onReady?.(undefined);
      };
    },
    [isReady, itemId, sourceKey, viewport, onReady],
  );
  const onLoad = async (loadedImage: HTMLImageElement) => {
    try {
      await loadedImage.decode?.();
      if (
        mounted.current &&
        image.current === loadedImage &&
        loadedImage.isConnected &&
        currentKey.current === sourceKey &&
        (loadedImage.currentSrc || loadedImage.src) === source?.url
      ) {
        options.onDecoded();
        setDecodedKey(sourceKey);
      }
    } catch {
      /* Keep the selected thumbnail when decoding fails. */
    }
  };
  return { sourceKey, isReady, onLoad, image };
}

/**
 * Measures before requesting display bytes and shares selection with warming.
 */
export function useSelectedPhoto(
  options: Readonly<SelectedPhotoOptions>,
): SelectedPhoto {
  const { media, itemId } = options;
  const frame = useRef<HTMLDivElement>(null);
  const resources = useContext(MediaLoadingContext);
  const viewport = usePhotoViewport({
    reference: frame,
    initial:
      resources?.navigation.getPreparedViewport(itemId) ??
      resources?.navigation.viewport,
  });
  const source =
    viewport === undefined
      ? undefined
      : getPhotoCandidateFromViewport({
          ...viewport,
          candidates: getPhotoCandidatesFromMedia(media),
        });
  useLayoutEffect(
    function publishSelectedPhotoViewport() {
      if (resources !== undefined && viewport !== undefined) {
        resources.navigation.viewport = viewport;
      }
    },
    [resources, viewport],
  );
  const ownership = useMediaSourceOwnership({
    itemId,
    source,
    viewport,
    sourceEpoch: options.sourceEpoch,
  });
  const decoded = usePhotoDecode({
    itemId,
    source,
    viewport,
    sourceEpoch: options.sourceEpoch,
    onDecoded: () => {
      if (options.presentation !== "preview") {
        ownership.finishSelectedDecode();
      }
    },
  });
  usePhotoArrival(itemId, decoded.sourceKey, {
    reference: frame,
    isReady: decoded.isReady && options.presentation !== "preview",
  });
  return {
    frame,
    source,
    viewport,
    handoff: ownership.handoff,
    discardHandoff: ownership.finishSelectedDecode,
    recheckHandoff: ownership.recheckHandoff,
    ...decoded,
  };
}
