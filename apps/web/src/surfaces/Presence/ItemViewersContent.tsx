import type { ItemDetail, ItemViewersResponse } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { PresenceReadState } from "./PresenceReadState";
import { ItemViewerRecords } from "./ItemViewerRecords";
import { ViewerItemPreview } from "./ViewerItemPreview";
import { ViewerItemReference } from "./ViewerItemReference";

type Props = {
  itemId: string;
  item: ItemDetail | undefined;
  viewers: ItemViewersResponse | undefined;
  timezone: string;
  isPending: boolean;
  onRetry: () => void;
};

/** Cached context and independently fetched opening records never trigger an item read. */
export function ItemViewersContent(options: Readonly<Props>): ReactNode {
  const { itemId, item, viewers, timezone, isPending, onRetry } = options;
  return (
    <>
      {item === undefined ? (
        <ViewerItemReference itemId={itemId} />
      ) : (
        <ViewerItemPreview detail={item} timezone={timezone} />
      )}
      {viewers === undefined ? (
        <PresenceReadState
          isPending={isPending}
          label="viewer records"
          onRetry={onRetry}
        />
      ) : (
        <ItemViewerRecords viewers={viewers} timezone={timezone} />
      )}
    </>
  );
}
