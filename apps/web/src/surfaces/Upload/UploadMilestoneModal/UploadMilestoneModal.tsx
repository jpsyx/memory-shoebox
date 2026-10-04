import { Modal } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { milestonesQueryOptions } from "@/api/milestones/milestonesQueryOptions";
import { UploadMilestoneModalContent } from "./UploadMilestoneModalContent";
import type {
  UploadSnapshot,
  UploadSessionController,
} from "@/upload/uploadSessionController/uploadSessionController.types";
import { useUploadMilestoneForm } from "./useUploadMilestoneForm";

type Props = {
  opened: boolean;
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  onClose: () => void;
};
/** Assigns or explicitly creates occasions for waiting upload manifest rows. */
export function UploadMilestoneModal({
  opened,
  snapshot,
  controller,
  onClose,
}: Readonly<Props>): ReactNode {
  const directory = useQuery({ ...milestonesQueryOptions(), enabled: opened });
  const form = useUploadMilestoneForm({
    opened,
    snapshot,
    controller,
    onClose,
    reloadList: async () => {
      const result = await directory.refetch();
      return !result.isError;
    },
  });
  const isLocked = snapshot.isBusy || form.isSaving;
  return (
    <Modal
      opened={opened}
      title={`Put ${snapshot.selectedFileIds.size} under a milestone`}
      size="lg"
      onClose={isLocked ? () => {} : onClose}
      closeButtonProps={{
        disabled: isLocked,
        "aria-label": "Close milestone picker",
      }}
    >
      <UploadMilestoneModalContent
        form={form}
        entries={directory.data?.milestones ?? []}
        count={snapshot.selectedFileIds.size}
        isLocked={isLocked}
        isPending={directory.isPending}
        isError={directory.isError}
        onRetry={() => {
          void directory.refetch();
        }}
      />
    </Modal>
  );
}
