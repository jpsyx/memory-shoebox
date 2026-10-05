import { Sheet } from "@/system/Chrome/Sheet";
import { Prose } from "@/system/typography/Prose";
import { Stack } from "@mantine/core";
import type { MilestoneRef } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import type { StrayItem } from "../MilestoneFix";
import { MilestoneFixHeading } from "./MilestoneFixHeading";
import classes from "./MilestoneFixLayout.module.css";
type Props = {
  milestone: MilestoneRef;
  strays: StrayItem[];
  totalMismatchCount: number;
  isPending: boolean;
  error?: string;
  choices: ReactNode;
  actions: ReactNode;
};
/** Frames date decisions with confirmation and recovery state. */
export function MilestoneFixLayout({
  milestone,
  strays,
  totalMismatchCount,
  isPending,
  error,
  choices,
  actions,
}: Readonly<
  Omit<Props, "strays"> & { strays: readonly StrayItem[] }
>): ReactNode {
  return (
    <Sheet wide label="Photographs outside the occasion">
      <Stack gap="md">
        <MilestoneFixHeading
          milestone={milestone}
          shownCount={strays.length}
          totalMismatchCount={totalMismatchCount}
        />
        {choices}
        {error !== undefined ? <Prose role="alert">{error}</Prose> : null}
        {isPending && error === undefined ? (
          <Prose role="status">
            Reading or saving the occasion. Your choices are kept.
          </Prose>
        ) : null}
        {actions}
        <Prose className={classes.milestoneFixLayoutExplanation}>
          Leaving these photographs as they are records that decision. They stay
          attached and keep their capture dates. Changing the occasion's dates
          asks for that decision again.
        </Prose>
      </Stack>
    </Sheet>
  );
}
