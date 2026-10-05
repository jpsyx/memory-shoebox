import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
import { Prose } from "@/system/typography/Prose";
import { Button } from "@mantine/core";
import type { MilestoneSummary } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import type { MilestoneSearch } from "../getMilestoneSearchFromUnknown/getMilestoneSearchFromUnknown";
import classes from "./MilestoneList.module.css";
import { MilestoneRow } from "./MilestoneRow/MilestoneRow";
/** Occasion summaries, creation authority and navigation. */
export type Props = {
  milestones: MilestoneSummary[];
  canCreate: boolean;
  onNavigate: (search: MilestoneSearch) => void;
};
/** Wrapping occasion rows use server counts and per-row capability gates. */
export function MilestoneList({
  milestones,
  canCreate,
  onNavigate,
}: Readonly<
  Omit<Props, "milestones"> & { milestones: readonly MilestoneSummary[] }
>): ReactNode {
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
              <MilestoneRow
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
