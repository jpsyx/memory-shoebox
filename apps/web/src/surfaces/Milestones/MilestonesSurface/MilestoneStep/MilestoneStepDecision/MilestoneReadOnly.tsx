import { Sheet } from "@/system/Chrome/Sheet";
import { Prose } from "@/system/typography/Prose";
import { Button } from "@mantine/core";
import type { ReactNode } from "react";
type Props = { onCancel: () => void };
/** Presents milestone read only. */
export function MilestoneReadOnly({ onCancel }: Readonly<Props>): ReactNode {
  return (
    <Sheet>
      <Prose>This occasion is read-only.</Prose>
      <Button mt="sm" variant="default" onClick={onCancel}>
        Back to the list
      </Button>
    </Sheet>
  );
}
