import type { ReactNode, ComponentProps } from "react";
import { ItemDetails } from "./ItemDetails/ItemDetails";
import { ItemMeta } from "../ItemViewer/ItemMeta";
import { itemHeading } from "../itemCopyHelpers/itemCopyHelpers";
import classes from "./ItemConversation.module.css";

type Props = ComponentProps<typeof ItemDetails> & {
  media: ReactNode;
  conversation: ReactNode;
};

/** Shared white surface, heading, More drawer and responsive media/comment grid. */
export function ItemConversation({
  media,
  conversation,
  ...details
}: Readonly<Props>): ReactNode {
  return (
    <main className={classes.itemPage}>
      <div className={classes.surface}>
        <header className={classes.header}>
          <div>
            <h1>{itemHeading(details.detail)}</h1>
            <ItemMeta detail={details.detail} timezone={details.timezone} />
          </div>
          <ItemDetails key={details.detail.itemId} {...details} />
        </header>
        <div className={classes.watchGrid}>
          <div className={classes.mediaColumn}>{media}</div>
          <div
            className={classes.conversationColumn}
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
