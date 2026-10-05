import { Banner } from "@/system/Chrome/Banner";
import { dayLabel } from "@/system/labelHelpers/labelHelpers";
import type { MilestoneFix } from "@/system/MilestoneFix/MilestoneFix";
import type { ComponentProps, ReactNode } from "react";
import type { Props as MilestoneFixProps } from "../MilestoneFix";
import { MilestoneFixRows } from "../MilestoneFixRows/MilestoneFixRows";
import { MilestoneFixApproach } from "./MilestoneFixApproach/MilestoneFixApproach";
type Props = {
  options: MilestoneFixProps;
  approach: string;
  onApproachChange: (approach: string) => void;
};
/** Offers explicit photograph dates or the server's whole-set wider span. */
export function MilestoneFixChoices({
  options,
  approach,
  onApproachChange,
}: Readonly<
  Omit<Props, "options"> & { options: ComponentProps<typeof MilestoneFix> }
>): ReactNode {
  const { wideningSpan, isPending } = options;
  return (
    <>
      <MilestoneFixApproach
        approach={approach}
        onApproachChange={onApproachChange}
        isPending={isPending}
      />
      {approach === "photos" ? (
        <MilestoneFixRows {...options} />
      ) : (
        <Banner>
          <b>
            The occasion becomes {dayLabel(wideningSpan.startsOn)} to{" "}
            {dayLabel(wideningSpan.endsOn)}.
          </b>{" "}
          Every day inside that stretch appears under this occasion in the
          timeline. Capture dates stay as they are.
        </Banner>
      )}
    </>
  );
}
