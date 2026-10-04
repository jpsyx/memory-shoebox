import { Button, Group } from "@mantine/core";
import type { ReactNode } from "react";
import type { MilestoneAttachment } from "../../useMilestoneAttachment/useMilestoneAttachment.types";
type Props = {
  picker: MilestoneAttachment;
  hasAuthority: boolean;
  onDone: () => void;
};
/** Saves the local delta and leaves Cancel available during recovery. */
export function MilestonePickerControls({
  picker,
  hasAuthority,
  onDone,
}: Readonly<Props>): ReactNode {
  return (
    <>
      {picker.hasMore ? (
        <Button variant="default" onClick={picker.loadMore}>
          Load more photographs
        </Button>
      ) : null}
      {picker.error ? (
        <Button variant="default" onClick={picker.retryReads}>
          Retry the photographs
        </Button>
      ) : null}
      <Group wrap="wrap">
        <Button
          variant="filled"
          disabled={picker.isPending || !hasAuthority}
          onClick={picker.save}
        >
          {picker.isPending ? "Saving photographs" : "Save photographs"}
        </Button>
        <Button variant="default" onClick={onDone}>
          Cancel
        </Button>
      </Group>
    </>
  );
}
