import type { ItemDetail, ItemViewersResponse } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { PresenceReadState } from "./PresenceReadState";
import { ItemViewerRecords } from "./ItemViewerRecords";
import { ViewerItemPreview } from "./ViewerItemPreview/ViewerItemPreview";
import { ViewerItemReference } from "./ViewerItemReference";

type Props = {
  itemId: string;
  item: ItemDetail | undefined;
  viewers: ItemViewersResponse | undefined;
  timezone: string;
  isPending: boolean;
  onRetry: () => void;
};

/**
 * Cached context and independently fetched opening records never trigger an
 * item read.
 */
export function ItemViewersContent({
  itemId,
  item,
  viewers,
  timezone,
  isPending,
  onRetry,
}: Readonly<Props>): ReactNode {
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
