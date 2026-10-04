import { Sheet } from "@/system/Chrome/Sheet";
import { Prose } from "@/system/typography/Prose";
import { Button } from "@mantine/core";
import type { ReactNode } from "react";
type Props = { onRetry: () => void; isDisabled: boolean };
/** A failed read leaves the addressed batch available for explicit retry. */
export function UploadUnavailable({
  onRetry,
  isDisabled,
}: Readonly<Props>): ReactNode {
  return (
    <Sheet wide label="Batch unavailable">
      <Prose>
        This batch could not be read. Retry to pick up where it stopped.
      </Prose>
      <Button variant="default" disabled={isDisabled} onClick={onRetry}>
        Retry this batch
      </Button>
    </Sheet>
  );
}
