import type { ActivityEntryDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import {
  activitySentence,
  activityKindLabel,
  activitySubjectLabel,
} from "../activityCopyHelpers/activityCopyHelpers";
import classes from "./ActivityRow.module.css";
type Props = { entry: ActivityEntryDto; timezone: string };

/** A complete historical fact with no live-record or media lookup links. */
export function ActivityRow({ entry, timezone }: Readonly<Props>): ReactNode {
  const time = new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(entry.occurredAt));
  const isRetroactive =
    entry.kind === "group_membership_changed" ||
    entry.kind === "item_visibility_changed" ||
    entry.kind === "group_deleted";
  return (
    <div className={classes.activityRowRow}>
      <time className={classes.activityRowWhen} dateTime={entry.occurredAt}>
        {time}
      </time>
      <div>
        <p className={classes.activityRowWhat}>
          <b>{entry.actor.label}</b> {activitySentence(entry)}
        </p>
        <p className={classes.activityRowMeta}>
          <b>{activitySubjectLabel(entry.subject)}</b>
          <span>{activityKindLabel(entry.kind)}</span>
          <span>{entry.deviceLabel ?? "Device not recorded"}</span>
        </p>
        {isRetroactive ? (
          <p className={classes.activityRowRetroactive}>
            Access changes apply to existing photographs too, including
            photographs uploaded before the change.
          </p>
        ) : null}
      </div>
    </div>
  );
}
