import type { ReactNode, ComponentProps } from "react";
import { ItemDetails } from "./ItemDetails/ItemDetails";
import { ItemMeta } from "../ItemViewer/ItemMeta";
import { itemHeading } from "../itemCopyHelpers/itemCopyHelpers";
import classes from "./ItemConversation.module.css";

type Props = ComponentProps<typeof ItemDetails> & {
  media: ReactNode;
  conversation: ReactNode;
};

/**
 * Shared page layout, heading, More drawer and elevated comments panel.
 */
export function ItemConversation({
  media,
  conversation,
  ...details
}: Readonly<Props>): ReactNode {
  return (
    <main className={classes.itemConversation}>
      <div
        className={classes.itemConversationSurface}
        data-item-conversation-surface
      >
        <header className={classes.itemConversationHeader}>
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
            {conversation}
          </div>
        </div>
      </div>
    </main>
  );
}
