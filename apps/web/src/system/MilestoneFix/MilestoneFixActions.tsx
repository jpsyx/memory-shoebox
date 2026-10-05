import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import { ChipRow } from "@/system/Chip/ChipRow";
import type { MilestoneFixProps } from "./MilestoneFix";
import { calendarDateSchema } from "@memory-shoebox/shared";
type Props = MilestoneFixProps & { approach: string };
function _hasExplicitTargets({
  milestone,
  itemIds,
  targets,
}: Readonly<
  Pick<MilestoneFixProps, "milestone" | "targets"> & {
    itemIds: readonly string[];
  }
>): boolean {
  return (
    itemIds.length > 0 &&
    itemIds.length <= 500 &&
    itemIds.every((itemId) => {
      const target = targets[itemId];
      return (
        target !== undefined &&
        calendarDateSchema.safeParse(target).success &&
        target >= milestone.startsOn &&
        target <= milestone.endsOn
      );
    })
  );
}
/** Distinct explicit actions with no span-day default for a move. */
export function MilestoneFixActions({
  approach,
  milestone,
  strays,
  targets,
  fieldErrors,
  isPending,
  onMove,
  onWiden,
  onAcknowledge,
}: Readonly<Props>): ReactNode {
  const itemIds = strays.map(({ itemId }) => {
    return itemId;
  });
  const hasTargets = _hasExplicitTargets({ milestone, itemIds, targets });
  const hasErrors = itemIds.some((itemId) => {
    return fieldErrors?.[itemId] !== undefined;
  });
  return (
    <ChipRow>
      <Button
        disabled={
          isPending || (approach === "photos" && (!hasTargets || hasErrors))
        }
        onClick={approach === "photos" ? onMove : onWiden}
      >
        {approach === "photos"
          ? `Move the ${strays.length}`
          : "Widen the occasion"}
      </Button>
      <Button
        variant="default"
        disabled={isPending || strays.length === 0}
        onClick={onAcknowledge}
      >
        Leave these {strays.length} as they are
      </Button>
    </ChipRow>
  );
}
