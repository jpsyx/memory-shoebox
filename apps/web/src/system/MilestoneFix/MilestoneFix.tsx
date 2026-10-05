import { Stack } from "@mantine/core";
import { useState, type ReactNode } from "react";
import type { MediaRef, MilestoneRef } from "@memory-shoebox/shared";
import { Sheet } from "@/system/Chrome/Sheet";
import { milestoneDatesLabel } from "@/system/labelHelpers/labelHelpers";
import { LabelText } from "@/system/typography/LabelText";
import { Prose } from "@/system/typography/Prose";
import { MilestoneFixChoices } from "./MilestoneFixChoices/MilestoneFixChoices";
import { MilestoneFixActions } from "./MilestoneFixActions";
import classes from "./MilestoneFix.module.css";
/** One visible attached photograph requiring a capture-day decision. */
export type StrayItem = {
  readonly itemId: string;
  readonly media: MediaRef;
  readonly capturedOn: string;
};
/** Controlled sheet inputs: action bodies remain the caller's responsibility. */
export type MilestoneFixProps = {
  milestone: MilestoneRef;
  strays: readonly StrayItem[];
  totalMismatchCount: number;
  wideningSpan: { startsOn: string; endsOn: string };
  targets: Readonly<Record<string, string | undefined>>;
  onTargetChange: (options: { itemId: string; targetOn: string }) => void;
  onMove: () => void;
  onWiden: () => void;
  onAcknowledge: () => void;
  isPending: boolean;
  error?: string;
  fieldErrors?: Readonly<Record<string, string>>;
};
type Props = MilestoneFixProps;
/** Keeps explicit per-item moves separate from whole-set widening and leaving. */
export function MilestoneFix(options: Readonly<Props>): ReactNode {
  const { milestone, strays, totalMismatchCount, isPending, error } = options;
  const [approach, setApproach] = useState("photos");
  return (
    <Sheet wide label="Photographs outside the occasion">
      <Stack gap="md">
        <LabelText component="h2">
          {totalMismatchCount} sit outside {milestone.name}
        </LabelText>
        <Prose>
          The occasion runs {milestoneDatesLabel(milestone)}. Showing{" "}
          {strays.length} photographs in this batch. Moving or leaving applies
          only to these photographs.
        </Prose>
        <MilestoneFixChoices
          options={options}
          approach={approach}
          onApproachChange={setApproach}
        />
        {error !== undefined ? <Prose role="alert">{error}</Prose> : null}
        {isPending && error === undefined ? (
          <Prose role="status">
            Reading or saving the occasion. Your choices are kept.
          </Prose>
        ) : null}
        <MilestoneFixActions {...options} approach={approach} />
        <Prose className={classes.milestoneFixExplanation}>
          Leaving these photographs as they are records that decision. They stay
          attached and keep their capture dates. Changing the occasion's dates
          asks for that decision again.
        </Prose>
      </Stack>
    </Sheet>
  );
}
