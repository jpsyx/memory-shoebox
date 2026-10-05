import type { ItemViewersResponse } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { Prose } from "@/system/typography/Prose";
import { ItemViewerRow } from "./ItemViewerRow/ItemViewerRow";

type Props = { viewers: ItemViewersResponse; timezone: string };

/** Real viewer records remain available without fetching media context. */
export function ItemViewerRecords({
  viewers,
  timezone,
}: Readonly<Props>): ReactNode {
  return (
    <>
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
