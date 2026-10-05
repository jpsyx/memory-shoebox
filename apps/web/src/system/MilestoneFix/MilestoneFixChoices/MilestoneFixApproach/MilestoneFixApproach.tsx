import { Radio, Stack, type RadioProps } from "@mantine/core";
import type { ReactNode } from "react";
import classes from "./MilestoneFixApproach.module.css";
type Props = {
  approach: string;
  onApproachChange: (approach: string) => void;
  isPending: boolean;
};
const RADIO_CLASS_NAMES = {
  description: classes.milestoneFixApproachDescription,
  labelWrapper: classes.milestoneFixApproachLabelWrapper,
} satisfies NonNullable<RadioProps["classNames"]>;
/** Selects photograph moves or whole-occasion widening without saving. */
export function MilestoneFixApproach({
  approach,
  onApproachChange,
  isPending,
}: Readonly<Props>): ReactNode {
  return (
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
  );
}
