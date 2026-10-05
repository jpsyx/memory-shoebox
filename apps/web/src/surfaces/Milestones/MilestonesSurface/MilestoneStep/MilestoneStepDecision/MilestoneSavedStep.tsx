import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
import { Prose } from "@/system/typography/Prose";
import { Button, Stack } from "@mantine/core";
import type { MilestoneDetail } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import type { MilestoneSearch } from "../../../getMilestoneSearchFromUnknown/getMilestoneSearchFromUnknown";
type Props = {
  detail: MilestoneDetail;
  mode: MilestoneSearch["mode"];
  onCancel: () => void;
};
/** Presents milestone saved step. */
export function MilestoneSavedStep({
  detail,
  mode,
  onCancel,
}: Readonly<Props>): ReactNode {
  return (
    <Sheet
      wide
      label={
        mode === "fix"
          ? "Photographs outside the span"
          : "Photographs for this occasion"
      }
    >
      <SheetHead title={detail.milestone.name} />
      <Stack gap="md">
        <Prose>
          {mode === "created"
            ? "The occasion is saved. Leaving this step keeps it on its dates."
            : mode === "fix"
              ? `${detail.mismatchCount} attached photographs need a decision about their dates.`
              : "Attaching photographs keeps them on the days they were taken."}
        </Prose>
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
      </Stack>
    </Sheet>
  );
}
