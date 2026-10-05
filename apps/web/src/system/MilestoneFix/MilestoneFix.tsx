import type { MediaRef, MilestoneRef } from "@memory-shoebox/shared";
import { useState, type ReactNode } from "react";
import { MilestoneFixActions } from "./MilestoneFixActions";
import { MilestoneFixChoices } from "./MilestoneFixChoices/MilestoneFixChoices";
import { MilestoneFixLayout } from "./MilestoneFixLayout/MilestoneFixLayout";
/** One visible attached photograph requiring a capture-day decision. */
export type StrayItem = {
  readonly itemId: string;
  readonly media: MediaRef;
  readonly capturedOn: string;
};
/**
 * Controlled sheet inputs: action bodies remain the caller's responsibility.
 */
export type Props = {
  milestone: MilestoneRef;
  strays: StrayItem[];
  totalMismatchCount: number;
  wideningSpan: { startsOn: string; endsOn: string };
  targets: Record<string, string | undefined>;
  onTargetChange: (options: { itemId: string; targetOn: string }) => void;
  onMove: () => void;
  onWiden: () => void;
  onAcknowledge: () => void;
  isPending: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};
/**
 * Keeps explicit per-item moves separate from whole-set widening and leaving.
 */
export function MilestoneFix({
  milestone,
  strays,
  totalMismatchCount,
  isPending,
  error,
  ...controls
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
    totalMismatchCount,
    isPending,
    error,
    ...controls,
  };

  const [approach, setApproach] = useState("photos");
  return (
    <MilestoneFixLayout
      milestone={milestone}
      strays={strays}
      totalMismatchCount={totalMismatchCount}
      isPending={isPending}
      error={error}
      choices={
        <MilestoneFixChoices
          options={options}
          approach={approach}
          onApproachChange={setApproach}
        />
      }
      actions={<MilestoneFixActions {...options} approach={approach} />}
    />
  );
}
