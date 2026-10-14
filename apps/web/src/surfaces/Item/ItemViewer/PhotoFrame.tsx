import type { ReactNode } from "react";
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
  options: Readonly<{ media: MediaRef; photo: SelectedPhoto }>,
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
        onLoad={(event) => {
          void photo.onLoad(event.currentTarget);
        }}
      />
    </picture>
  );
}

/** Shows this item's thumbnail until its exact responsive source decodes. */
export function PhotoFrame({ media, itemId }: Readonly<Props>): ReactNode {
  const photo = useSelectedPhoto({ media, itemId });
  return (
    <div
      ref={photo.frame}
      className={classes.frame}
      data-photo-surface="viewer"
      data-photo-item={itemId}
      data-photo-ready={photo.isReady}
    >
      <div className={photoClasses.pixels}>
        {photo.isReady ? null : _renderThumbnail(media)}
        {_renderPicture({ media, photo })}
      </div>
    </div>
  );
}
