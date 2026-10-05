import type { ItemDetail, ItemViewersResponse } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { Prose } from "@/system/typography/Prose";
import { PresenceReadState } from "./PresenceReadState";
import { ItemViewerRow } from "./ItemViewerRow";
import { ViewerItemPreview } from "./ViewerItemPreview";

type Props = {
  item: ItemDetail | undefined;
  viewers: ItemViewersResponse | undefined;
  timezone: string;
  isPending: boolean;
  onRetry: () => void;
};
/** Unavailable reads cannot be mistaken for a list with zero viewers. */
export function ItemViewersContent(options: Readonly<Props>): ReactNode {
  const { item, viewers, timezone, isPending, onRetry } = options;
  if (item === undefined || viewers === undefined)
    return (
      <PresenceReadState
        isPending={isPending}
        label="item and viewer records"
        onRetry={onRetry}
      />
    );
  return (
    <>
      <ViewerItemPreview detail={item} timezone={timezone} />
      <Prose>
        Opening this report counts as a full-size opening by you. Other visible
        photographs in this burst may also be marked as seen. Reloading can add
        another opening.
      </Prose>
      <Prose>
        These rows include currently eligible members and retained opens by
        removed members. Eligibility and opening at full size are separate
        facts. An absent observation is not a visit history.
      </Prose>
      {viewers.viewers.length === 0 ? (
        <Prose>No eligible viewer records to show.</Prose>
      ) : (
        <div>
          {viewers.viewers.map((viewer) => {
            return (
              <ItemViewerRow
                key={viewer.member.memberId}
                viewer={viewer}
                timezone={timezone}
              />
            );
          })}
        </div>
      )}
    </>
  );
}
