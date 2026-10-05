import type { ReactNode } from "react";
import { MilestoneFix } from "@/system/MilestoneFix/MilestoneFix";
import { Prose } from "@/system/typography/Prose";
import { Sheet } from "@/system/Chrome/Sheet";
import type { useMilestoneReconcile } from "../useMilestoneReconcile/useMilestoneReconcile";
type Props = { controller: ReturnType<typeof useMilestoneReconcile> };
/** Keeps the owning hook mounted through denied or unavailable authority. */
export function MilestoneReconcileFix({
  controller,
}: Readonly<Props>): ReactNode {
  if (!controller.detail.canEdit) {
    return (
      <Sheet>
        <Prose>This occasion is read-only.</Prose>
      </Sheet>
    );
  }
  if (controller.detail.mismatchCount === 0 && controller.hasUsableReads) {
    return (
      <Sheet>
        <Prose role="status">
          No photographs need a date decision for{" "}
          {controller.detail.milestone.name}.
        </Prose>
      </Sheet>
    );
  }
  return (
    <MilestoneFix
      milestone={controller.detail.milestone}
      strays={controller.strays}
      totalMismatchCount={controller.detail.mismatchCount}
      wideningSpan={controller.wideningSpan ?? controller.detail.milestone}
      targets={controller.targets}
      onTargetChange={controller.changeTarget}
      onMove={controller.move}
      onWiden={controller.widen}
      onAcknowledge={controller.acknowledge}
      isPending={controller.isPending}
      error={
        controller.error ??
        (controller.hasReadError
          ? "Refresh the occasion and photographs before saving. Your dates are kept."
          : undefined)
      }
      fieldErrors={controller.fieldErrors}
    />
  );
}
