import type { ItemViewerRow as ViewerRow } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { memberDate } from "@/surfaces/Members/memberCopyHelpers";
import classes from "./ItemViewerRow.module.css";
type Props = { viewer: ViewerRow; timezone: string };

/**
 * Distinguishes a recorded full-size open, a sighting, and no recorded
 * observation.
 */
export function ItemViewerRow({
  viewer,
  timezone,
}: Readonly<Props>): ReactNode {
  return (
    <div className={classes.itemViewerRowViewer}>
      <b>{viewer.member.displayName}</b>
      <div className={classes.itemViewerRowQuiet}>
        {viewer.hasOpened ? (
          <>
            <div>
              Last opened:{" "}
              {memberDate({
                timestamp: viewer.lastOpenedAt ?? undefined,
                timezone,
              })}{" "}
              · opened {viewer.openCount.toLocaleString()}×
            </div>
            <div>
              First opened:{" "}
              {memberDate({
                timestamp: viewer.firstOpenedAt ?? undefined,
                timezone,
              })}
            </div>
          </>
        ) : (
          <div>
            {viewer.firstSeenAt === null
              ? "No sighting or full-size open recorded"
              : "Seen on the timeline; no full-size open recorded"}
          </div>
        )}
        {viewer.firstSeenAt === null ? null : (
          <div>
            First seen:{" "}
            {memberDate({ timestamp: viewer.firstSeenAt, timezone })}
          </div>
        )}
      </div>
    </div>
  );
}
