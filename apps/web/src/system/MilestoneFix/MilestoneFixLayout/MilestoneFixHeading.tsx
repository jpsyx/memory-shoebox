import { milestoneDatesLabel } from "@/system/labelHelpers/labelHelpers";
import { LabelText } from "@/system/typography/LabelText";
import { Prose } from "@/system/typography/Prose";
import type { MilestoneRef } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
type Props = {
  milestone: MilestoneRef;
  shownCount: number;
  totalMismatchCount: number;
};
/** Names the occasion span and the pending photographs in this batch. */
export function MilestoneFixHeading({
  milestone,
  shownCount,
  totalMismatchCount,
}: Readonly<Props>): ReactNode {
  return (
    <>
      <LabelText component="h2">
        {totalMismatchCount} sit outside {milestone.name}
      </LabelText>
      <Prose>
        The occasion runs {milestoneDatesLabel(milestone)}. Showing {shownCount}{" "}
        photographs in this batch. Moving or leaving applies only to these
        photographs.
      </Prose>
    </>
  );
}
