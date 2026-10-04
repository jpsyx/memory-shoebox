import { milestonesQueryOptions } from "@/api/milestones/milestonesQueryOptions";
import { isFocusLost } from "@/system/focusHelpers";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/uploadSessionController/uploadSessionController.types";
import { Modal } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, type ReactNode } from "react";
import { UploadMilestoneModalContent } from "./UploadMilestoneModalContent";
import { useUploadMilestoneForm } from "./useUploadMilestoneForm";

type Props = {
  memberId: string;
  opened: boolean;
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  onClose: () => void;
};
function useUploadModalExitFocus({
  opened,
  hasSelection,
}: Readonly<{ opened: boolean; hasSelection: boolean }>): () => void {
  const owningHeading = useRef<HTMLElement | undefined>(undefined);
  const pendingFrame = useRef<number | undefined>(undefined);
  useEffect(
    function retainOwningUploadHeading() {
      if (opened) {
        owningHeading.current =
          document.querySelector<HTMLElement>(
            'main [aria-label^="Upload to "] h1',
          ) ?? undefined;
      }
      return () => {
        if (pendingFrame.current !== undefined) {
          cancelAnimationFrame(pendingFrame.current);
        }
      };
    },
    [opened],
  );
  return () => {
    pendingFrame.current = requestAnimationFrame(() => {
      const heading = owningHeading.current;
      if (!hasSelection && heading?.isConnected && isFocusLost()) {
        heading.tabIndex = -1;
        heading.focus();
      }
    });
  };
}

/** Assigns or explicitly creates occasions for waiting upload manifest rows. */
export function UploadMilestoneModal({
  memberId,
  opened,
  snapshot,
  controller,
  onClose,
}: Readonly<Props>): ReactNode {
  const hasSelection = snapshot.selectedFileIds.size > 0;
  const onExitTransitionEnd = useUploadModalExitFocus({ opened, hasSelection });
  const directory = useQuery({
    ...milestonesQueryOptions(),
    queryKey: ["milestones", "upload", memberId],
    enabled: opened,
  });
  const form = useUploadMilestoneForm({
    opened,
    snapshot,
    controller,
    onClose,
    reloadList: async () => {
      return !(await directory.refetch()).isError;
    },
  });
  const isLocked = snapshot.isBusy || form.isSaving;
  return (
    <Modal
      opened={opened}
      title={`Put ${snapshot.selectedFileIds.size} under a milestone`}
      size="lg"
      onClose={isLocked ? () => {} : onClose}
      onExitTransitionEnd={onExitTransitionEnd}
      closeButtonProps={{
        disabled: isLocked,
        "aria-label": "Close milestone picker",
      }}
    >
      <UploadMilestoneModalContent
        {...{ form, isLocked }}
        entries={directory.data?.milestones ?? []}
        count={snapshot.selectedFileIds.size}
        isPending={directory.isPending}
        isError={directory.isError}
        onRetry={() => {
          void directory.refetch();
        }}
      />
    </Modal>
  );
}
