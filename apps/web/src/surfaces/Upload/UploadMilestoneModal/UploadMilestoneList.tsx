import { clsx } from "clsx";
import type { ReactNode } from "react";
import type { MilestoneListResponse } from "@/api/milestones/milestones.types";
import { milestoneDatesLabel } from "@/system/labelHelpers/labelHelpers";
import classes from "@/system/system.module.css";
import uploadClasses from "../upload.module.css";
type Props = {
  entries: MilestoneListResponse["milestones"];
  chosenId?: string;
  isLocked: boolean;
  onChoose: (milestoneId: string) => void;
};
/** An id-valued list showing each occasion's span and visible item count. */
export function UploadMilestoneList({
  entries,
  chosenId,
  isLocked,
  onChoose,
}: Readonly<Props>): ReactNode {
  return (
    <div>
      {entries.map(({ milestone, itemCount }) => {
        return (
          <button
            key={milestone.milestoneId}
            type="button"
            disabled={isLocked}
            className={clsx(
              classes.milestoneOption,
              chosenId === milestone.milestoneId && classes.milestoneOptionOn,
            )}
            aria-pressed={chosenId === milestone.milestoneId}
            onClick={() => {
              return onChoose(milestone.milestoneId);
            }}
          >
            <span>
              <span className={classes.milestoneOptionName}>
                {milestone.name}
              </span>
              <br />
              <span className={uploadClasses.milestoneMeta}>
                {milestoneDatesLabel(milestone)} ·{" "}
                {itemCount === 0
                  ? "nothing attached yet"
                  : `${itemCount} attached`}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
