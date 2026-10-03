import { Button, Modal, Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Prose } from "@/system/typography/Prose";

type Props = {
  opened: boolean;
  /** The words are the viewer's own, rather than somebody else's. */
  isOwn: boolean;
  /** Called as "Delete it" closes the dialog. */
  onDelete?: () => void;
  onClose: () => void;
};

/**
 * Asks before a comment goes, and says what goes with it. The title says
 * whose words they are, because "Delete what you wrote?" is a false sentence
 * to an admin taking down somebody else's.
 */
export function CommentDeleteDialog({
  opened,
  isOwn,
  onDelete,
  onClose,
}: Readonly<Props>): ReactNode {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isOwn ? "Delete what you wrote?" : "Delete this comment?"}
    >
      <Stack gap="md">
        <Prose>
          It goes, and so does every reaction anybody left on it. What it was
          said about stays. Anybody who was emailed it still has that email,
          which is not something deleting can reach.
        </Prose>
        <ChipRow>
          <Button
            variant="danger"
            onClick={() => {
              onClose();
              onDelete?.();
            }}
          >
            Delete it
          </Button>
          <Button variant="default" onClick={onClose}>
            Keep it
          </Button>
        </ChipRow>
      </Stack>
    </Modal>
  );
}
