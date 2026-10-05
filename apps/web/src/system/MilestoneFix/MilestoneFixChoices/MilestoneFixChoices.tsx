import { Radio, Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { Banner } from "@/system/Chrome/Banner";
import { dayLabel } from "@/system/labelHelpers/labelHelpers";
import { MilestoneFixRows } from "../MilestoneFixRows/MilestoneFixRows";
import type { MilestoneFixProps } from "../MilestoneFix";
import classes from "./MilestoneFixChoices.module.css";
type Props = {
  options: Readonly<MilestoneFixProps>;
  approach: string;
  onApproachChange: (approach: string) => void;
};
const RADIO_CLASS_NAMES = {
  description: classes.milestoneFixChoicesDescription,
  labelWrapper: classes.milestoneFixChoicesLabelWrapper,
};
/** Offers explicit photograph dates or the server's whole-set wider span. */
export function MilestoneFixChoices({
  options,
  approach,
  onApproachChange,
}: Readonly<Props>): ReactNode {
  const { wideningSpan, isPending } = options;
  return (
    <>
      <Radio.Group
        value={approach}
        onChange={onApproachChange}
        aria-label="What to change"
      >
        <Stack gap="sm">
          <Radio
            classNames={RADIO_CLASS_NAMES}
            disabled={isPending}
            value="photos"
            label="Move the photographs onto the occasion"
            description="Choose which day each photograph belongs to."
          />
          <Radio
            classNames={RADIO_CLASS_NAMES}
            disabled={isPending}
            value="milestone"
            label="Widen the occasion to cover them"
            description="Includes every pending mismatch, including photographs not loaded here."
          />
        </Stack>
      </Radio.Group>
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
