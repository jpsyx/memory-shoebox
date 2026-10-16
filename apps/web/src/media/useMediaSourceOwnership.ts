import type { MediaDestination } from "./mediaPrefetch.types";
import {
  useContext,
  useLayoutEffect,
  useReducer,
  useRef,
  useSyncExternalStore,
} from "react";
import { MediaLoadingContext } from "./MediaLoadingContext";
import type {
  DecodedPhotoSnapshot,
  MediaSourceClaim,
} from "./createMediaNavigation";
import type { PhotoViewport } from "./photoViewportHelpers";

const EMPTY_SUBSCRIBE = (): (() => void) => {
  return () => {};
};
const EMPTY_SNAPSHOT = (): number => {
  return 0;
};

/**
 * Reads a pure pixel snapshot and adopts transport only after a view commits.
 */
export function useMediaSourceOwnership(
  options: Readonly<
    MediaDestination & { viewport?: PhotoViewport; sourceEpoch?: number }
  >,
): {
  handoff: DecodedPhotoSnapshot | undefined;
  finishSelectedDecode: () => void;
  recheckHandoff: () => void;
} {
  const resources = useContext(MediaLoadingContext);
  useSyncExternalStore(
    resources?.navigation.subscribe ?? EMPTY_SUBSCRIBE,
    resources?.navigation.getSnapshot ?? EMPTY_SNAPSHOT,
  );
  const claim = useRef<MediaSourceClaim | undefined>(undefined);
  const [, recheckHandoff] = useReducer((revision: number) => {
    return revision + 1;
  }, 0);
  const { itemId, viewport, sourceEpoch } = options;
  const url = options.source?.url;
  const renditionId = options.source?.renditionId;
  useLayoutEffect(() => {
    const adopted = resources?.navigation.adopt({
      itemId,
      viewport,
      sourceEpoch,
      source:
        url === undefined || renditionId === undefined
          ? undefined
          : { url, renditionId },
    });
    claim.current = adopted;
    return () => {
      if (claim.current === adopted) {
        claim.current = undefined;
      }
      adopted?.release();
    };
  }, [resources, itemId, url, renditionId, viewport, sourceEpoch]);
  return {
    handoff: resources?.navigation.getDecodedPhoto(options),
    recheckHandoff,
    finishSelectedDecode: () => {
      claim.current?.finishSelectedDecode();
    },
  };
}
