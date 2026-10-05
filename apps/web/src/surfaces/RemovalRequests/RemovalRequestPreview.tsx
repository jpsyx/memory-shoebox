import type { RemovalRequestDto } from "@memory-shoebox/shared";
import { useState, type ReactNode } from "react";
import { getItemHrefFromRemovalRequest } from "./removalCopyHelpers/removalCopyHelpers";
import classes from "./RemovalRequestCard/RemovalRequestCard.module.css";

type Props = { request: RemovalRequestDto };

/** Null identity means Gone; null media alone does not assert deletion. */
export function RemovalRequestPreview({ request }: Readonly<Props>): ReactNode {
  const [failedUrl, setFailedUrl] = useState<string>();
  const href = getItemHrefFromRemovalRequest(request);
  if (href === undefined || request.media === null) {
    return (
      <span className={classes.ghost}>
        {request.itemId === null ? "Gone" : "Unavailable"}
      </span>
    );
  }
  return (
    <a href={href} className={classes.preview} aria-label="Open the photograph">
      {failedUrl === request.media.thumb.url ? (
        <span className={classes.ghost}>Unavailable</span>
      ) : (
        <img
          src={request.media.thumb.url}
          alt={request.media.altText}
          loading="lazy"
          onError={() => {
            setFailedUrl(request.media?.thumb.url);
          }}
        />
      )}
    </a>
  );
}
