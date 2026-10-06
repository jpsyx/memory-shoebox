import { Button, Group, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";

type Props = {
  label: string;
  isLocked: boolean;
  problem?: string;
  hasUnconfirmedRemoval: boolean;
  isSaving: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

/** Confirmation copy and actions shared by individual and bulk removal. */
export function UploadRemovalModalBody({
  label,
  isLocked,
  problem,
  hasUnconfirmedRemoval,
  isSaving,
  onClose,
  onConfirm,
}: Readonly<Props>): ReactNode {
  return (
    <Stack gap="lg">
      <Text>
        Remove {label} from this upload? The originals on this device will stay
        unchanged.
      </Text>
      {problem ? <Text role="alert">{problem}</Text> : null}
      <Group justify="flex-end">
        <Button
          variant="panel"
          data-autofocus
          disabled={isLocked}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          disabled={isLocked || hasUnconfirmedRemoval}
          loading={isSaving}
          onClick={onConfirm}
        >
          Remove {label}
        </Button>
      </Group>
    </Stack>
  );
}
