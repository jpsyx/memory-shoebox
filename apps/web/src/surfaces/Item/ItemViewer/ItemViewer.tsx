import type { ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import classes from "@/system/system.module.css";
import { itemHeading } from "@/surfaces/Item/itemCopyHelpers/itemCopyHelpers";
import { ItemMediaColumn } from "@/surfaces/Item/ItemViewer/ItemMediaColumn";
import { VideoConversation } from "@/surfaces/Item/VideoConversation/VideoConversation";
import { ItemSheets } from "@/surfaces/Item/ItemViewer/ItemSheets";
import { ItemTopBar } from "@/surfaces/Item/ItemViewer/ItemTopBar";
import { useVideoTransport } from "@/surfaces/Item/ItemViewer/useVideoTransport";
import { useWayBack } from "@/surfaces/Item/ItemViewer/useWayBack";

type Props = {
  detail: ItemDetail;
  /** The item being left, drawn while the next one loads: it takes no write. */
  isPlaceholder: boolean;
  viewer: Viewer;
  timezone: string;
};

/**
 * Surfaces 3 and 4 once the item is in hand: `.viewer`, two columns, the
 * frame and its run on the left and the talk panel on the right, collapsing
 * to one column at 56rem (`design-spec.md` § Responsive behaviour).
 *
 * The heading is visually hidden: a sighted reader has the photograph, and a
 * screen reader needs somewhere to land that says what this page is.
 *
 * A video's transport is held here, above both columns: the left one draws
 * the bar and the pin, the right one the composer and the stamps.
 */
export function ItemViewer({
  detail,
  isPlaceholder,
  viewer,
  timezone,
}: Readonly<Props>): ReactNode {
  const wayBack = useWayBack(detail.capturedOn);
  const transport = useVideoTransport(detail.itemId);
  if (detail.kind === "video") {
    return (
      <>
        <ItemTopBar capturedOn={detail.capturedOn} />
        <VideoConversation
          key={detail.itemId}
          detail={detail}
          isPlaceholder={isPlaceholder}
          viewer={viewer}
          timezone={timezone}
          transport={transport}
          onDeleted={wayBack.leave}
        />
      </>
    );
  }
  return (
    <>
      <ItemTopBar capturedOn={detail.capturedOn} />
      <main className={classes.viewer}>
        <h1 className="visually-hidden">{itemHeading(detail)}</h1>
        <ItemMediaColumn
          detail={detail}
          isPlaceholder={isPlaceholder}
          viewer={viewer}
          timezone={timezone}
          transport={transport}
        />
        {/* Keyed by item: a half-typed comment or an open editor belongs to
            one item. The left column is not, which keeps the strip's focus
            across a move. */}
        <ItemSheets
          key={detail.itemId}
          detail={detail}
          isPlaceholder={isPlaceholder}
          viewer={viewer}
          timezone={timezone}
          transport={transport}
          onDeleted={wayBack.leave}
        />
      </main>
    </>
  );
}
