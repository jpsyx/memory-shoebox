import { Prose } from "@/system/typography/Prose";
import { Button } from "@mantine/core";
import type { ReactNode } from "react";
type Props = { onRefresh: () => void; onCancel: () => void };
/** Presents milestone selection error. */
export function MilestoneSelectionError({
  onRefresh,
  onCancel,
}: Readonly<Props>): ReactNode {
  return (
    <>
      <Prose onPanel role="alert">
        This occasion could not be read. Refresh it or return to the list.
      </Prose>
      <Button variant="panel" onClick={onRefresh}>
        Refresh the occasion
      </Button>
      <Button variant="panel" onClick={onCancel}>
        Back to the list
      </Button>
    </>
  );
}
