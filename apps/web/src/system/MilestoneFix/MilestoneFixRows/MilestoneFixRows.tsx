import { NativeSelect } from "@mantine/core";
import { type ReactNode } from "react";
import type { MilestoneFixProps, StrayItem } from "../MilestoneFix";
import { dayLabel, milestoneDays } from "@/system/labelHelpers/labelHelpers";
import { Prose } from "@/system/typography/Prose";
import { MilestoneFixThumbnail } from "./MilestoneFixThumbnail/MilestoneFixThumbnail";
import classes from "./MilestoneFixRows.module.css";
type Props = Pick<
  MilestoneFixProps,
  | "milestone"
  | "strays"
  | "targets"
  | "onTargetChange"
  | "isPending"
  | "fieldErrors"
>;
function _MilestoneFixDate({
  options,
  stray,
}: Readonly<{ options: Props; stray: StrayItem }>): ReactNode {
  const { milestone, targets, onTargetChange, isPending, fieldErrors } =
    options;
  if (milestone.startsOn === milestone.endsOn) {
    return fieldErrors?.[stray.itemId] === undefined ? null : (
      <Prose role="alert">{fieldErrors[stray.itemId]}</Prose>
    );
  }
  return (
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
function _MilestoneFixRow({
  options,
  stray,
}: Readonly<{ options: Props; stray: StrayItem }>): ReactNode {
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
      <_MilestoneFixDate options={options} stray={stray} />
    </div>
  );
}
/** Displays controlled item-keyed targets with accessible local errors. */
export function MilestoneFixRows(options: Readonly<Props>): ReactNode {
  return (
    <div className={classes.milestoneFixRows}>
      {options.strays.map((stray) => {
        return (
          <_MilestoneFixRow
            key={stray.itemId}
            options={options}
            stray={stray}
          />
        );
      })}
    </div>
  );
}
