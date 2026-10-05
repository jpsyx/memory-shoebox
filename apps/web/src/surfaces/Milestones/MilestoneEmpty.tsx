import { Button, Stack } from "@mantine/core";
import type { MilestoneDetail } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
import { Prose } from "@/system/typography/Prose";
import { MilestoneBand } from "@/system/Pile/MilestoneBand";
type Props = {
  detail: MilestoneDetail;
  onAttach: () => void;
  onCancel: () => void;
};
/** A real band preview, including zero visible items and the stored span. */
export function MilestoneEmpty({
  detail,
  onAttach,
  onCancel,
}: Readonly<Props>): ReactNode {
  return (
    <Sheet wide label="A milestone with nothing attached">
      <SheetHead title={detail.milestone.name} />
      <Stack gap="md">
        <Prose>
          {detail.itemCount === 0
            ? "Nothing is attached for you to see yet. The occasion still stands in the timeline on its own dates."
            : "This occasion now has photographs attached."}
        </Prose>
        <MilestoneBand
          band={{
            milestone: detail.milestone,
            itemCount: detail.itemCount,
            dayCount: detail.dayCount,
            dayPosition: 1,
          }}
        />
        {detail.canEdit ? (
          <Button onClick={onAttach}>Attach photographs</Button>
        ) : null}
        <Button variant="default" onClick={onCancel}>
          Back to the list
        </Button>
      </Stack>
    </Sheet>
  );
}
