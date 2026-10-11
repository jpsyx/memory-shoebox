import { Button, Group, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import type { TimelineBulkFormProps } from "./TimelineBulkDialog";

/** Cancel gets initial focus; deletion is sent only by the explicit action. */
export function TimelineDeleteConfirmation(
  props: Readonly<TimelineBulkFormProps>,
): ReactNode {
  return (
    <Stack gap="lg">
      <Text>
        These {props.itemIds.length} photos and videos will be permanently
        deleted from the Shoebox, along with their comments and reactions. This
        cannot be undone.
      </Text>
      <Text>Originals saved on your own devices will stay unchanged.</Text>
      <Group justify="flex-end">
        <Button
          variant="default"
          data-autofocus
          disabled={props.isBusy}
          onClick={props.onClose}
        >
          Cancel
        </Button>
        <Button
          disabled={props.isBlocked}
          loading={props.isBusy}
          onClick={() => {
            props.onSubmit({ action: "delete", itemIds: [...props.itemIds] });
          }}
        >
          Delete {props.itemIds.length} permanently
        </Button>
      </Group>
    </Stack>
  );
}
