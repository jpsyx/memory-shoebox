import { Modal } from "@mantine/core";
import type {
  DeleteMilestoneResponse,
  MilestoneDetail,
} from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { MilestoneDeleteContents } from "./MilestoneDeleteContents/MilestoneDeleteContents";
import { useMilestoneDeletion } from "./useMilestoneDeletion";
type Props = {
  detail: MilestoneDetail;
  memberId: string;
  onDeleted: (result: DeleteMilestoneResponse) => void;
  onCancel: () => void;
};
/**
 * Deletes the label and joins, with media retention stated before submission.
 */
export function MilestoneDeleteDialog({
  detail,
  memberId,
  onDeleted,
  onCancel,
}: Readonly<Props>): ReactNode {
  const options = { detail, memberId, onDeleted, onCancel };
  const deletion = useMilestoneDeletion(options);
  return (
    <Modal
      opened
      onClose={() => {
        if (!deletion.isPending) {
          options.onCancel();
        }
      }}
      title="Delete this milestone?"
      closeOnEscape={!deletion.isPending}
      closeOnClickOutside={!deletion.isPending}
      withCloseButton={!deletion.isPending}
      returnFocus
    >
      <MilestoneDeleteContents options={options} deletion={deletion} />
    </Modal>
  );
}
