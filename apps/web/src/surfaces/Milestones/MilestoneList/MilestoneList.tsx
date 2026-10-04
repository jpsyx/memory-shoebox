import { Button, Group } from "@mantine/core";
import type { MilestoneSummary } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { milestoneDatesLabel } from "@/system/labelHelpers/labelHelpers";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
import { Prose } from "@/system/typography/Prose";
import type { MilestoneSearch } from "../getMilestoneSearchFromUnknown/getMilestoneSearchFromUnknown";
import classes from "./MilestoneList.module.css";
type Props = {
  milestones: readonly MilestoneSummary[];
  canCreate: boolean;
  onNavigate: (search: MilestoneSearch) => void;
};
function _getActionsFromMilestoneSummary(row: MilestoneSummary): Array<
  Readonly<{
    mode: MilestoneSearch["mode"];
    label: string;
    isAvailable: boolean;
  }>
> {
  return [
    { mode: "empty", label: "View", isAvailable: row.itemCount === 0 },
    { mode: "edit", label: "Edit", isAvailable: row.canEdit },
    { mode: "attach", label: "Attach", isAvailable: row.canEdit },
    { mode: "delete", label: "Delete", isAvailable: row.canDelete },
  ];
}
function _MilestoneActions({
  row,
  onOpen,
}: Readonly<{
  row: MilestoneSummary;
  onOpen: (mode: MilestoneSearch["mode"]) => void;
}>): ReactNode {
  return (
    <Group className={classes.milestoneListActions} gap="xs">
      {_getActionsFromMilestoneSummary(row)
        .filter((action) => {
          return action.isAvailable;
        })
        .map((action) => {
          return (
            <Button
              key={action.mode}
              variant="default"
              onClick={() => {
                onOpen(action.mode);
              }}
              aria-label={`${action.label}${action.mode === "attach" ? " to" : ""} ${row.milestone.name}`}
            >
              {action.label}
            </Button>
          );
        })}
    </Group>
  );
}
function _MilestoneRow({
  row,
  onNavigate,
}: Readonly<{
  row: MilestoneSummary;
  onNavigate: Props["onNavigate"];
}>): ReactNode {
  const { milestone } = row;
  const onOpen = (mode: MilestoneSearch["mode"]) => {
    return onNavigate({ milestone: milestone.milestoneId, mode });
  };
  return (
    <li className={classes.milestoneListRow}>
      <div className={classes.milestoneListWords}>
        <b>{milestone.name}</b>
        {milestone.blurb ? <p>{milestone.blurb}</p> : null}
      </div>
      <div className={classes.milestoneListFacts}>
        <span>{milestoneDatesLabel(milestone)}</span>
        <span>
          {row.itemCount} {row.itemCount === 1 ? "item" : "items"}
        </span>
      </div>
      <_MilestoneActions row={row} onOpen={onOpen} />
    </li>
  );
}
/** Wrapping occasion rows use server counts and per-row capability gates. */
export function MilestoneList({
  milestones,
  canCreate,
  onNavigate,
}: Readonly<Props>): ReactNode {
  return (
    <Sheet wide label="Milestones">
      <SheetHead title="Milestones">
        {canCreate ? (
          <Button
            onClick={() => {
              return onNavigate({ mode: "create" });
            }}
          >
            New milestone
          </Button>
        ) : null}
      </SheetHead>
      {milestones.length === 0 ? (
        <Prose>
          No milestones yet. An occasion can stand on its own dates even before
          photographs are attached.
        </Prose>
      ) : (
        <ul className={classes.milestoneListRows}>
          {milestones.map((row) => {
            return (
              <_MilestoneRow
                key={row.milestone.milestoneId}
                row={row}
                onNavigate={onNavigate}
              />
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
