import { usePhotoSourceFailure } from "@/media/usePhotoSourceFailure";
import { useLayoutEffect, useRef, useMemo, type ReactNode } from "react";
import { useMediaLease } from "@/media/useMediaLease";
import type { MediaRef } from "@memory-shoebox/shared";
import { MediaPlaceholder } from "@/system/MediaPlaceholder/MediaPlaceholder";
import { useSelectedPhoto, type SelectedPhoto } from "@/media/useSelectedPhoto";
import classes from "@/system/system.module.css";
import photoClasses from "./PhotoFrame.module.css";

type Props = { media: MediaRef; itemId: string };

function _renderThumbnail(media: Readonly<MediaRef>): ReactNode {
  return media.thumb !== null ? (
    <img
      src={media.thumb.url}
      alt={media.altText}
      width={media.width}
      height={media.height}
    />
  ) : (
    <MediaPlaceholder
      className={classes.framePlaceholder}
      altText={media.altText}
      width={media.width}
      height={media.height}
      state={media.previewState}
    />
  );
}

function _renderPicture(
  options: Readonly<{
    media: MediaRef;
    photo: SelectedPhoto;
    onError?: () => void;
  }>,
): ReactNode {
  const { media, photo } = options;
  const { source, viewport } = photo;
  if (source === undefined || viewport === undefined) {
    return null;
  }
  const fittedWidth = Math.min(
    viewport.cssWidth,
    (viewport.cssHeight * source.width) / source.height,
  );
  return (
    <picture
      key={photo.sourceKey}
      className={photo.isReady ? photoClasses.ready : photoClasses.loading}
      aria-hidden={!photo.isReady}
    >
      <source
        type={source.contentType}
        srcSet={`${source.url} ${source.width}w`}
        sizes={`${fittedWidth}px`}
      />
      <img
        src={source.url}
        alt={media.altText}
        width={media.width}
        height={media.height}
        onError={options.onError}
        onLoad={(event) => {
          void photo.onLoad(event.currentTarget);
        }}
      />
    </picture>
  );
}

/** Shows this item's thumbnail until its exact responsive source decodes. */
export function PhotoFrame({
  media: initialMedia,
  itemId,
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
  });
  const previous = useRef<{
    itemId: string;
    media: MediaRef;
    photo: SelectedPhoto;
  }>(undefined);
  useLayoutEffect(() => {
    if (photo.isReady) {
      previous.current = { itemId, media, photo };
    }
  }, [itemId, media, photo]);
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
        {photo.isReady
          ? null
          : retained === undefined
            ? _renderThumbnail(media)
            : _renderPicture(retained)}
        {_renderPicture({ media, photo, onError: failure.onError })}
        {failure.hasError ? (
          <button type="button" onClick={failure.retry}>
            Try loading photo again
          </button>
        ) : null}
      </div>
    </div>
  );
}
