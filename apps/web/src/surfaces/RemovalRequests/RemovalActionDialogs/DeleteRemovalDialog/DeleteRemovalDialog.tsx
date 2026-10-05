import { Modal } from "@mantine/core";
import type { ReactNode } from "react";
import type { RemovalActions } from "../../useRemovalActions/useRemovalActions";
import { restoreRemovalQueueFocus } from "../restoreRemovalQueueFocus";
import { DeleteRemovalContents } from "./DeleteRemovalContents";
type Props = { actions: RemovalActions };

/** An explicit permanent file, photograph, and discussion deletion. */
export function DeleteRemovalDialog({ actions }: Readonly<Props>): ReactNode {
  return (
    <Modal
      opened={actions.dialog === "delete"}
      onClose={actions.close}
      title="Delete it?"
      closeOnEscape={!actions.isPending}
      closeOnClickOutside={!actions.isPending}
      withCloseButton={!actions.isPending}
      returnFocus
      onExitTransitionEnd={restoreRemovalQueueFocus}
    >
      <DeleteRemovalContents actions={actions} />
    </Modal>
  );
}
