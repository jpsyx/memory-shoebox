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
 * burst it leaves, and each attached milestone whose span contains it now and
 * would not contain the new day. A milestone it already falls outside loses
 * nothing by the move, so it is not named. Nothing is detached; "it stays
 * attached" is the truth, because the offer to reconcile belongs to step 8b
 * (decision 11).
 */
export function DateMoveWarnings({ detail, day }: Readonly<Props>): ReactNode {
  const { burst } = detail;
  if (day === detail.capturedOn) {
    return null;
  }
  const leaving = detail.milestones.filter((milestone) => {
    return (
      milestone.spanContainsCapturedOn &&
      (day < milestone.startsOn || day > milestone.endsOn)
    );
  });
  if (burst === null && leaving.length === 0) {
    return null;
  }
  return (
    <Banner icon={<IconAlertCircle {...ICON_PROPS} />}>
      {burst === null ? null : (
        <>
          <b>{`Moving it off ${dayMonthLabel(detail.capturedOn)} takes it out of its burst.`}</b>{" "}
          {burstLeavingProse(burst.visibleFrameCount)}
        </>
      )}
      {leaving.map((milestone, index) => {
        const isFirstSentence = burst === null && index === 0;
        return (
          <Fragment key={milestone.milestoneId}>
            {isFirstSentence ? "It falls" : " It also falls"} outside{" "}
            <b>{milestone.name}</b>, and stays attached to it.
          </Fragment>
        );
      })}
    </Banner>
  );
}
