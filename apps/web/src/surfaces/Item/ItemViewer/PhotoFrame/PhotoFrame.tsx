import { useMediaLease } from "@/media/useMediaLease/useMediaLease";
import { usePhotoSourceFailure } from "@/media/usePhotoSourceFailure";
import { useSelectedPhoto, type SelectedPhoto } from "@/media/useSelectedPhoto";
import classes from "@/system/system.module.css";
import type { MediaRef } from "@memory-shoebox/shared";
import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { DecodedPhotoHandoff } from "../DecodedPhotoHandoff";
import photoClasses from "./PhotoFrame.module.css";
import { PhotoThumbnail } from "./PhotoThumbnail";
import { SelectedPhotoPicture } from "./SelectedPhotoPicture";

type Props = {
  media: MediaRef;
  itemId: string;
  presentation?: "preview" | "selected";
};

/** Shows owned pixels or a thumbnail until the current responsive image decodes. */
export function PhotoFrame({
  media: initialMedia,
  itemId,
  presentation = "selected",
}: Readonly<Props>): ReactNode {
  const lease = useMediaLease({
    itemId,
    initialMedia,
    purpose: "selected-view",
    isVisible: true,
  });
  const media = useMemo(() => {
    return (
      lease.media ?? {
        ...initialMedia,
        thumb: null,
        display: null,
        displayCandidates: [],
        poster: null,
        playback: null,
      }
    );
  }, [lease.media, initialMedia]);
  const failure = usePhotoSourceFailure({ itemId, renew: lease.renew });
  const photo = useSelectedPhoto({
    media,
    itemId,
    sourceEpoch: failure.version,
    presentation,
  });
  const previous = useRef<{
    itemId: string;
    media: MediaRef;
    photo: SelectedPhoto;
  }>(undefined);
  useLayoutEffect(
    function retainDecodedPhoto() {
      if (photo.isReady) {
        previous.current = { itemId, media, photo };
      }
    },
    [itemId, media, photo],
  );
  const retained =
    lease.media !== undefined && previous.current?.itemId === itemId
      ? previous.current
      : undefined;
  return (
    <div
      ref={photo.frame}
      className={classes.frame}
      data-photo-surface="viewer"
      data-photo-item={itemId}
      data-photo-ready={photo.isReady}
    >
      <div className={photoClasses.pixels}>
        {photo.isReady ? null : photo.handoff !== undefined ? (
          <DecodedPhotoHandoff
            snapshot={photo.handoff}
            media={media}
            onUnavailable={photo.recheckHandoff}
          />
        ) : retained !== undefined ? (
          <SelectedPhotoPicture {...retained} />
        ) : photo.viewport === undefined ? null : (
          <PhotoThumbnail media={media} viewport={photo.viewport} />
        )}
        <SelectedPhotoPicture
          media={media}
          photo={photo}
          onError={() => {
            photo.discardHandoff();
            failure.onError();
          }}
        />
        {failure.hasError ? (
          <button type="button" onClick={failure.retry}>
            Try loading photo again
          </button>
        ) : null}
      </div>
    </div>
  );
}
