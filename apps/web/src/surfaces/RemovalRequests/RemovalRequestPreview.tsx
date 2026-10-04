import type { RemovalRequestDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { getItemHrefFromRemovalRequest } from "./removalCopyHelpers/removalCopyHelpers";
import classes from "./RemovalRequestCard/RemovalRequestCard.module.css";

type Props = { request: RemovalRequestDto };

/** Null identity means Gone; null media alone does not assert deletion. */
export function RemovalRequestPreview({ request }: Readonly<Props>): ReactNode {
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
      <img
        src={request.media.thumb.url}
        alt={request.media.altText}
        loading="lazy"
      />
    </a>
  );
}
