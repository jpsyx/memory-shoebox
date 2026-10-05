import type {
  MilestoneFixRows,
  Props as OwnerProps,
} from "@/system/MilestoneFix/MilestoneFixRows/MilestoneFixRows";
import { dayLabel, milestoneDays } from "@/system/labelHelpers/labelHelpers";
import { Prose } from "@/system/typography/Prose";
import { NativeSelect } from "@mantine/core";
import { type ComponentProps, type ReactNode } from "react";
import type { StrayItem } from "../../../MilestoneFix";
import classes from "./MilestoneFixDate.module.css";
type Props = { options: OwnerProps; stray: StrayItem };
/** Presents milestone fix date. */
export function MilestoneFixDate({
  options,
  stray,
}: Readonly<
  Omit<Props, "options"> & { options: ComponentProps<typeof MilestoneFixRows> }
>): ReactNode {
  const { milestone, targets, onTargetChange, isPending, fieldErrors } =
    options;
  return milestone.startsOn === milestone.endsOn ? (
    fieldErrors?.[stray.itemId] === undefined ? null : (
      <Prose role="alert">{fieldErrors[stray.itemId]}</Prose>
    )
  ) : (
    <NativeSelect
      className={classes.milestoneFixDate}
      label="Choose a day"
      aria-label={`Which day ${stray.itemId} belongs to`}
      value={targets[stray.itemId] ?? ""}
      disabled={isPending}
      error={fieldErrors?.[stray.itemId]}
      onChange={(event) => {
        return onTargetChange({
          itemId: stray.itemId,
          targetOn: event.currentTarget.value,
        });
      }}
      data={[
        { value: "", label: "Choose a day" },
        ...milestoneDays(milestone).map((day) => {
          return {
            value: day,
            label: dayLabel(day),
          };
        }),
      ]}
    />
  );
}
