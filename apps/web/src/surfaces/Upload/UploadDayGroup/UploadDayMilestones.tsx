import system from "@/system/system.module.css";
import type { UploadDayGroup as Day } from "@memory-shoebox/shared";
import { IconFlag } from "@tabler/icons-react";
import { type ReactNode } from "react";
type Props = {
  day: Day;
};

/** Shows the occasions assigned to this capture day. */
export function UploadDayMilestones({ day }: Readonly<Props>): ReactNode {
  return (
    <div className={system.uploadDayMilestone}>
      {day.milestones.length > 0 ? (
        <>
          <IconFlag size="1rem" aria-hidden="true" />
          {day.milestones.map((milestone) => {
            return <b key={milestone.milestoneId}>{milestone.name}</b>;
          })}
        </>
      ) : (
        <span className={system.fileMeta}>No milestone</span>
      )}
    </div>
  );
}
