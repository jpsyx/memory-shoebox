import type { ItemViewerRow as ViewerRow } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { memberDate } from "@/surfaces/Members/memberCopy";
import classes from "./Presence.module.css";

/** Distinguishes a recorded full-size open, a sighting, and no recorded observation. */
export function ItemViewerRow({
  viewer,
  timezone,
}: Readonly<{ viewer: ViewerRow; timezone: string }>): ReactNode {
  return (
    <div className={classes.viewer}>
      <b>{viewer.member.displayName}</b>
      <div className={classes.quiet}>
        {viewer.hasOpened ? (
          <>
            <div>
              Last opened:{" "}
              {memberDate({ timestamp: viewer.lastOpenedAt, timezone })} ·
              opened {viewer.openCount.toLocaleString()}×
            </div>
            <div>
              First opened:{" "}
              {memberDate({ timestamp: viewer.firstOpenedAt, timezone })}
            </div>
          </>
        ) : (
          <div>
            {viewer.firstSeenAt === null
              ? "No sighting or full-size open recorded"
              : "Seen in the pile; no full-size open recorded"}
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
