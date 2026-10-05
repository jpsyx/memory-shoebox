import { Modal } from "@mantine/core";
import { useEffect, useState, type ReactNode } from "react";
import type { RemovalActions } from "../../useRemovalActions/useRemovalActions";
import { restoreRemovalQueueFocus } from "../restoreRemovalQueueFocus";
import { DeclineRemovalContents } from "./DeclineRemovalContents";
type Props = { actions: RemovalActions };

/**
 * A compulsory plain-text answer, retaining failed words until target changes.
 */
export function DeclineRemovalDialog({ actions }: Readonly<Props>): ReactNode {
  const requestId = actions.target?.requestId;
  const [draft, setDraft] = useState({ requestId, reason: "" });
  useEffect(
    function resetDeclineDraftForRequest() {
      setDraft((current) => {
        return current.requestId === requestId
          ? current
          : { requestId, reason: "" };
      });
    },
    [requestId],
  );
  const reason = draft.requestId === requestId ? draft.reason : "";
  const setReason = (updatedReason: string) => {
    setDraft({ requestId, reason: updatedReason });
  };
  return (
    <Modal
      opened={actions.dialog === "decline"}
      onClose={actions.close}
      title="Keep it, and say why"
      closeOnEscape={!actions.isPending}
      closeOnClickOutside={!actions.isPending}
      withCloseButton={!actions.isPending}
      returnFocus
      onExitTransitionEnd={restoreRemovalQueueFocus}
    >
      <DeclineRemovalContents
        actions={actions}
        reason={reason}
        onChangeReason={setReason}
      />
    </Modal>
  );
}
