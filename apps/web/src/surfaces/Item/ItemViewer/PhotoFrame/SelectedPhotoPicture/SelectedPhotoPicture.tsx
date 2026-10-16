import { clsx } from "clsx";
import { type SelectedPhoto } from "@/media/useSelectedPhoto";
import type { MediaRef } from "@memory-shoebox/shared";
import { type ReactNode } from "react";
import classes from "./SelectedPhotoPicture.module.css";

type Props = { media: MediaRef; photo: SelectedPhoto; onError?: () => void };
/** Displays one exact selected source and announces it only after decode. */
export function SelectedPhotoPicture({
  media,
  photo,
  onError,
}: Readonly<Props>): ReactNode {
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
      className={clsx({
        [classes.selectedPhotoPictureReady ?? ""]: photo.isReady,
        [classes.selectedPhotoPictureLoading ?? ""]: !photo.isReady,
      })}
      aria-hidden={!photo.isReady}
    >
      <source
        type={source.contentType}
        srcSet={`${source.url} ${source.width}w`}
        sizes={`${fittedWidth}px`}
      />
      <img
        ref={photo.image}
        src={source.url}
        alt={media.altText}
        width={media.width}
        height={media.height}
        onError={onError}
        onLoad={(event) => {
          void photo.onLoad(event.currentTarget);
        }}
      />
    </picture>
  );
}
