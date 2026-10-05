import { type ReactNode } from "react";
import type { Props as MilestoneFixProps, StrayItem } from "../MilestoneFix";
import { MilestoneFixRow } from "./MilestoneFixRow/MilestoneFixRow";
import classes from "./MilestoneFixRows.module.css";
/** Controlled photograph targets and their local validation errors. */
export type Props = Pick<
  MilestoneFixProps,
  | "milestone"
  | "strays"
  | "targets"
  | "onTargetChange"
  | "isPending"
  | "fieldErrors"
>;
/** Displays controlled item-keyed targets with accessible local errors. */
export function MilestoneFixRows({
  milestone,
  strays,
  targets,
  onTargetChange,
  isPending,
  fieldErrors,
}: Readonly<
  Omit<Props, "strays" | "targets" | "fieldErrors"> & {
    strays: readonly StrayItem[];
    targets: Readonly<Props["targets"]>;
    fieldErrors?: Readonly<Props["fieldErrors"]>;
  }
>): ReactNode {
  const options = {
    milestone,
    strays,
    targets,
    onTargetChange,
    isPending,
    fieldErrors,
  };
  return (
    <div className={classes.milestoneFixRows}>
      {options.strays.map((stray) => {
        return (
          <MilestoneFixRow key={stray.itemId} options={options} stray={stray} />
        );
      })}
    </div>
  );
}
