import { clsx } from "clsx";
import { TheaterCommentDock } from "../ItemTheater/TheaterCommentDock/TheaterCommentDock";
import type { TheaterCommentDockController } from "../ItemTheater/useTheaterCommentDock";
import type { ItemPresentation } from "../ItemViewer/ItemViewer.types";
import type { ReactNode, ComponentProps } from "react";
import { ItemDetails } from "./ItemDetails/ItemDetails";
import { ItemMeta } from "../ItemViewer/ItemMeta";
import { itemHeading } from "../itemCopyHelpers/itemCopyHelpers";
import classes from "./ItemConversation.module.css";

type Props = ComponentProps<typeof ItemDetails> & {
  presentation?: ItemPresentation;
  dockController: TheaterCommentDockController;
  media: ReactNode;
  conversation: ReactNode;
};

/**
 * Shared page layout, heading, More drawer and elevated comments panel.
 */
export function ItemConversation({
  media,
  conversation,
  presentation = "page",
  dockController,
  ...details
}: Readonly<Props>): ReactNode {
  return (
    <main
      className={clsx(
        classes.itemConversation,
        presentation === "theater" && classes.theater,
      )}
    >
      <div
        className={classes.itemConversationSurface}
        data-item-conversation-surface
      >
        <header
          className={classes.itemConversationHeader}
          hidden={presentation === "theater"}
        >
          <div>
            <h1>{itemHeading(details.detail)}</h1>
            <ItemMeta detail={details.detail} timezone={details.timezone} />
          </div>
          <ItemDetails key={details.detail.itemId} {...details} />
        </header>
        <div className={classes.itemConversationGrid}>
          <div className={classes.itemConversationMediaColumn}>{media}</div>
          <div
            className={classes.itemConversationCommentsColumn}
            key={details.detail.itemId}
            inert={details.isPlaceholder}
          >
            <TheaterCommentDock
              presentation={presentation}
              controller={dockController}
              commentCount={details.detail.comments.length}
              isUnavailable={details.isPlaceholder}
            >
              {conversation}
            </TheaterCommentDock>
          </div>
        </div>
      </div>
    </main>
  );
}
