import { ChipRow } from "@/system/Chip/ChipRow";
import { Button } from "@mantine/core";
import { calendarDateSchema } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import type { Props as MilestoneFixProps, StrayItem } from "./MilestoneFix";
type Props = MilestoneFixProps & { approach: string };
function _hasValidTargets({
  milestone,
  strays,
  targets,
  fieldErrors,
}: Readonly<
  Pick<MilestoneFixProps, "milestone"> & {
    targets: Readonly<MilestoneFixProps["targets"]>;
    fieldErrors?: Readonly<MilestoneFixProps["fieldErrors"]>;
  } & {
    strays: readonly StrayItem[];
  }
>): boolean {
  return (
    strays.length > 0 &&
    strays.length <= 500 &&
    strays.every(({ itemId }) => {
      const target = targets[itemId];
      return (
        fieldErrors?.[itemId] === undefined &&
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
}: Readonly<
  Omit<Props, "strays" | "targets" | "fieldErrors"> & {
    strays: readonly StrayItem[];
    targets: Readonly<Props["targets"]>;
    fieldErrors?: Readonly<Props["fieldErrors"]>;
  }
>): ReactNode {
  const hasTargets = _hasValidTargets({
    milestone,
    strays,
    targets,
    fieldErrors,
  });
  return (
    <ChipRow>
      <Button
        disabled={isPending || (approach === "photos" && !hasTargets)}
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
