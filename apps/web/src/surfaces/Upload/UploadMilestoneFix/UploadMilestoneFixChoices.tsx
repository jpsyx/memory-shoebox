import type { ReactNode } from "react";
import type { UploadMismatchGroup } from "@memory-shoebox/shared";
import { Banner } from "@/system/Chrome/Banner";
import { dayLabel } from "@/system/labelHelpers/labelHelpers";
import type { useUploadMilestoneFix } from "./useUploadMilestoneFix";
import { UploadMilestoneFixApproach } from "./UploadMilestoneFixApproach";
import { UploadMilestoneFixRows } from "./UploadMilestoneFixRows";
type Props = {
  group: UploadMismatchGroup;
  form: ReturnType<typeof useUploadMilestoneFix>;
  isLocked: boolean;
};
/** Offers explicit file days or a read-only preview of the widened occasion. */
export function UploadMilestoneFixChoices({
  group,
  form,
  isLocked,
}: Readonly<Props>): ReactNode {
  return (
    <>
      <UploadMilestoneFixApproach
        group={group}
        form={form}
        isLocked={isLocked}
      />
      {form.approach === "photos" ? (
        <UploadMilestoneFixRows group={group} form={form} isLocked={isLocked} />
      ) : (
        <Banner>
          <b>
            The occasion becomes {dayLabel(form.widenedSpan.startsOn)} to{" "}
            {dayLabel(form.widenedSpan.endsOn)}.
          </b>{" "}
          Any other day inside that stretch joins it too.
        </Banner>
      )}
    </>
  );
}
