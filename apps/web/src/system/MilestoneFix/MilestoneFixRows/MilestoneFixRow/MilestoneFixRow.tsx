import type { MilestoneFixRows } from "@/system/MilestoneFix/MilestoneFixRows/MilestoneFixRows";
import { dayLabel } from "@/system/labelHelpers/labelHelpers";
import { Prose } from "@/system/typography/Prose";
import { type ComponentProps, type ReactNode } from "react";
import type { StrayItem } from "../../MilestoneFix";
import type { Props as OwnerProps } from "../MilestoneFixRows";
import { MilestoneFixDate } from "./MilestoneFixDate/MilestoneFixDate";
import classes from "./MilestoneFixRow.module.css";
import { MilestoneFixThumbnail } from "./MilestoneFixThumbnail/MilestoneFixThumbnail";
type Props = { options: OwnerProps; stray: StrayItem };
/** Presents milestone fix row. */
export function MilestoneFixRow({
  options,
  stray,
}: Readonly<
  Omit<Props, "options"> & { options: ComponentProps<typeof MilestoneFixRows> }
>): ReactNode {
  const { milestone } = options;
  const isSpan = milestone.startsOn !== milestone.endsOn;
  return (
    <div className={classes.milestoneFixRow}>
      <MilestoneFixThumbnail stray={stray} />
      <Prose>
        Taken {dayLabel(stray.capturedOn)}
        {!isSpan ? (
          <>
            <br />
            Becomes {dayLabel(milestone.startsOn)}
          </>
        ) : null}
      </Prose>
      <MilestoneFixDate options={options} stray={stray} />
    </div>
  );
}
