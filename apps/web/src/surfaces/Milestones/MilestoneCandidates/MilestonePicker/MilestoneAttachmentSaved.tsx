import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
import { Prose } from "@/system/typography/Prose";
import { Button, Group, Stack } from "@mantine/core";
import type { MilestoneDetail } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
type Props = {
  detail: MilestoneDetail;
  counts: { attachedCount: number; detachedCount: number };
  onDone: () => void;
  onFix: (detail: MilestoneDetail) => void;
};
/**
 * Confirmed counts belong to the server, with a separate date-fixing choice.
 */
export function MilestoneAttachmentSaved({
  detail,
  counts,
  onDone,
  onFix,
}: Readonly<Props>): ReactNode {
  return (
    <Sheet wide label="Photographs saved">
      <SheetHead title={detail.milestone.name} />
      <Stack gap="md">
        <Prose role="status">
          {counts.attachedCount} attached; {counts.detachedCount} detached.
        </Prose>
        {detail.mismatchCount > 0 ? (
          <Prose>
            {detail.mismatchCount} attached photographs need a decision about
            their dates.
          </Prose>
        ) : null}
        <Group wrap="wrap">
          {detail.mismatchCount > 0 ? (
            <Button
              onClick={() => {
                onFix(detail);
              }}
            >
              Fix photograph dates
            </Button>
          ) : null}
          <Button variant="default" onClick={onDone}>
            Back to the list
          </Button>
        </Group>
      </Stack>
    </Sheet>
  );
}
