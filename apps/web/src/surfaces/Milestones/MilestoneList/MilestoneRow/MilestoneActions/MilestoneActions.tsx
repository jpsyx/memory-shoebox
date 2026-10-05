import type { MilestoneSearch } from "@/surfaces/Milestones/getMilestoneSearchFromUnknown/getMilestoneSearchFromUnknown";
import { Button, Group } from "@mantine/core";
import type { MilestoneSummary } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import classes from "./MilestoneActions.module.css";
type Props = {
  row: MilestoneSummary;
  onOpen: (mode: MilestoneSearch["mode"]) => void;
};
function _getActionsFromMilestoneSummary(
  row: Readonly<MilestoneSummary>,
): Array<{
  mode: MilestoneSearch["mode"];
  label: string;
  isAvailable: boolean;
}> {
  return [
    { mode: "empty", label: "View", isAvailable: row.itemCount === 0 },
    { mode: "edit", label: "Edit", isAvailable: row.canEdit },
    { mode: "attach", label: "Attach", isAvailable: row.canEdit },
    { mode: "delete", label: "Delete", isAvailable: row.canDelete },
  ];
}
/** Presents milestone actions. */
export function MilestoneActions({ row, onOpen }: Readonly<Props>): ReactNode {
  return (
    <Group className={classes.milestoneActionsRoot} gap="xs">
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
