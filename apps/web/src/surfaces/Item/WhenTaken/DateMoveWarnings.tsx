import { IconAlertCircle } from "@tabler/icons-react";
import { Fragment, type ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import { Banner } from "@/system/Chrome/Banner";
import { ICON_PROPS } from "@/system/icons";
import { dayMonthLabel } from "@/system/labelHelpers/labelHelpers";
import { burstLeavingProse } from "@/surfaces/Item/itemCopy/itemCopy";

type Props = {
  detail: ItemDetail;
  /** The day the field holds now, `YYYY-MM-DD`. */
  day: string;
};

/**
 * What moving it to another day will break, said before it breaks it: the
 * burst it leaves, and each attached milestone whose span would no longer
 * contain it. Nothing is detached; "it stays attached" is the truth, because
 * the offer to reconcile belongs to step 8b (decision 11).
 */
export function DateMoveWarnings({ detail, day }: Readonly<Props>): ReactNode {
  if (day === detail.capturedOn) {
    return null;
  }
  const outside = detail.milestones.filter((milestone) => {
    return day < milestone.startsOn || day > milestone.endsOn;
  });
  if (detail.burst === null && outside.length === 0) {
    return null;
  }
  return (
    <Banner icon={<IconAlertCircle {...ICON_PROPS} />}>
      {detail.burst === null ? null : (
        <>
          <b>{`Moving it off ${dayMonthLabel(detail.capturedOn)} takes it out of its burst.`}</b>{" "}
          {burstLeavingProse(detail.burst.visibleFrameCount)}
        </>
      )}
      {outside.map((milestone) => {
        return (
          <Fragment key={milestone.milestoneId}>
            {" "}
            It also falls outside <b>{milestone.name}</b>, and stays attached to
            it.
          </Fragment>
        );
      })}
    </Banner>
  );
}
