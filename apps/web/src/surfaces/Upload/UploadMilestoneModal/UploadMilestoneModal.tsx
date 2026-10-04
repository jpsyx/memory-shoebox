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
  memberId: string;
  opened: boolean;
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  onClose: () => void;
};
/** Assigns or explicitly creates occasions for waiting upload manifest rows. */
export function UploadMilestoneModal(props: Readonly<Props>): ReactNode {
  const { memberId, opened, snapshot, controller, onClose } = props;
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
