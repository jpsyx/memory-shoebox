import { useVisibleThumbnail } from "@/media/useVisibleThumbnail/useVisibleThumbnail";
import { MediaPlaceholder } from "@/system/MediaPlaceholder/MediaPlaceholder";
import type { RemovalRequestDto } from "@memory-shoebox/shared";
import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import classes from "./RemovalRequestPreview.module.css";
type Props = { request: RemovalRequestDto };

/** Null identity means Gone; null media alone does not assert deletion. */
export function RemovalRequestPreview({ request }: Readonly<Props>): ReactNode {
  const [failedUrl, setFailedUrl] = useState<string>();
  const thumbnail = useVisibleThumbnail({
    itemId: request.itemId ?? "",
    source: request.media?.thumb ?? null,
  });
  if (request.itemId === null || request.media === null) {
    return (
      <span className={classes.removalRequestPreviewGhost}>
        {request.itemId === null ? "Gone" : "Unavailable"}
      </span>
    );
  }
  return (
    <Link
      ref={thumbnail.ref}
      to="/items/$itemId"
      params={{ itemId: request.itemId }}
      className={classes.removalRequestPreviewPrint}
      aria-label="Open the photograph"
    >
      {request.media.thumb === null || failedUrl === request.media.thumb.url ? (
        <MediaPlaceholder
          altText={request.media.altText}
          width={request.media.width}
          height={request.media.height}
          state={
            request.media.thumb === null
              ? request.media.previewState
              : "unavailable"
          }
        />
      ) : (
        <img
          src={thumbnail.source?.url}
          alt={request.media.altText}
          loading={thumbnail.loading}
          onError={() => {
            setFailedUrl(request.media?.thumb?.url);
          }}
        />
      )}
    </Link>
  );
}
