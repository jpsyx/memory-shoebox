import {
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { MediaRef, MediaPreviewRequest } from "@memory-shoebox/shared";
import { MediaLoadingContext } from "./MediaLoadingContext";
import type {
  MediaLeaseRegistration,
  MediaLeaseSnapshot,
} from "./createMediaLeaseCoordinator";

import type { MediaLoadingResources } from "./createMediaLoadingResources";

type Snapshot = {
  owner: MediaLoadingResources | undefined;
  itemId: string;
  lease: MediaLeaseSnapshot;
};

type Options = {
  itemId: string;
  initialMedia: MediaRef;
  purpose: MediaPreviewRequest["purpose"];
  isVisible: boolean;
};
function useLeaseRegistration(
  options: Readonly<Options>,
  resources: MediaLoadingResources | undefined,
  setSnapshot: Dispatch<SetStateAction<Snapshot | undefined>>,
): () => Promise<MediaRef | undefined> {
  const { itemId, initialMedia, purpose, isVisible } = options;
  const registration = useRef<MediaLeaseRegistration | undefined>(undefined);
  const initial = useRef({ media: initialMedia, isVisible });
  initial.current = { media: initialMedia, isVisible };
  useLayoutEffect(() => {
    registration.current =
      itemId === ""
        ? undefined
        : resources?.leases.register({
            itemId,
            initialMedia: initial.current.media,
            purpose,
            isVisible: initial.current.isVisible,
            onChange: (lease) => {
              setSnapshot({ owner: resources, itemId, lease });
            },
          });
    return () => {
      registration.current?.release();
      registration.current = undefined;
    };
  }, [resources, itemId, purpose, setSnapshot]);
  useLayoutEffect(() => {
    registration.current?.setVisible(isVisible);
  }, [isVisible]);
  useLayoutEffect(() => {
    registration.current?.updateInitial(initialMedia);
  }, [initialMedia]);
  return useCallback(async () => {
    return registration.current?.renew();
  }, []);
}

/** Renews authorized media only while actually visible; never opens an item. */
export function useMediaLease(
  options: Readonly<Options>,
): MediaLeaseSnapshot & { renew: () => Promise<MediaRef | undefined> } {
  const resources = useContext(MediaLoadingContext);
  const { itemId, initialMedia } = options;
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const renew = useLeaseRegistration(options, resources, setSnapshot);
  const lease =
    snapshot !== undefined &&
    snapshot.owner === resources &&
    snapshot.itemId === itemId
      ? snapshot.lease
      : {
          media: resources?.leases.isDenied(itemId) ? undefined : initialMedia,
          hasError: resources?.leases.isDenied(itemId) ?? false,
        };
  const media = useMemo(() => {
    return lease.media === undefined
      ? undefined
      : {
          ...lease.media,
          altText: initialMedia.altText,
          width: initialMedia.width,
          height: initialMedia.height,
          durationMs: initialMedia.durationMs,
        };
  }, [lease.media, initialMedia]);
  return { ...lease, media, renew };
}
