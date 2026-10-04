import { Banner } from "@/system/Chrome/Banner";
import classes from "@/system/system.module.css";
import { Prose } from "@/system/typography/Prose";
import { Stat } from "@/system/typography/Stat";
import type { UploadOutcomeSummary } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
type Props = { summary: UploadOutcomeSummary };
/** Server summary counts and confirmed queued notification fan-out. */
export function UploadOutcome({ summary }: Readonly<Props>): ReactNode {
  return (
    <>
      {" "}
      <div className={classes.uploadFigureRow}>
        <Stat figure={summary.itemCount} label="Went up" />
        <Stat figure={summary.dayCount} label="Days" />
        <Stat figure={summary.milestoneCount} label="Milestones" />
      </div>
      <Banner>
        {summary.burstCount > 0
          ? `${summary.burstFrameCount} frames sit in ${summary.burstCount} burst stacks. `
          : ""}
        Everything that arrived is on its capture day.
      </Banner>
      {summary.notifiedMemberCount === null ? (
        <Prose>
          The batch is finished. Notification queue confirmation is not
          available yet.
        </Prose>
      ) : (
        <Prose>
          One batch notification was queued for {summary.notifiedMemberCount}{" "}
          people who can see at least one of these. This does not confirm
          delivery.
        </Prose>
      )}
    </>
  );
}
