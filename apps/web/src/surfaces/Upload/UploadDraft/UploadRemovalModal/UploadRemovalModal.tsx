import { uploadOperationProblemCopy } from "../../uploadCopyHelpers/uploadCopyHelpers";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { Modal } from "@mantine/core";
import { UploadRemovalModalBody } from "./UploadRemovalModalBody";
import { useState, type ReactNode } from "react";

type Props = {
  fileIds: readonly string[];
  snapshot: UploadSnapshot;
  controller: UploadSessionController;
  onClose: () => void;
};

type RemovalForm = {
  isSaving: boolean;
  problem?: string;
  onConfirm: () => Promise<void>;
};

function useRemovalForm({
  fileIds,
  snapshot,
  controller,
  onClose,
}: Readonly<Props>): RemovalForm {
  const [isSaving, setIsSaving] = useState(false);
  const [problem, setProblem] = useState<string>();
  return {
    isSaving,
    problem,
    onConfirm: async () => {
      setIsSaving(true);
      setProblem(undefined);
      try {
        const targets = fileIds.filter((fileId) => {
          return snapshot.detail?.files.some((file) => {
            return file.fileId === fileId;
          });
        });
        if (targets.length > 0) {
          await controller.removeFiles(targets);
        }
        onClose();
      } catch {
        setProblem(
          uploadOperationProblemCopy(
            controller.getSnapshot().error ?? { operation: "remove" },
          ),
        );
      } finally {
        setIsSaving(false);
      }
    },
  };
}

/** Confirms individual or bulk removal before changing the saved draft. */
export function UploadRemovalModal({
  fileIds,
  snapshot,
  controller,
  onClose,
}: Readonly<Props>): ReactNode {
  const form = useRemovalForm({ fileIds, snapshot, controller, onClose });
  const isLocked = form.isSaving || snapshot.isBusy;
  const count = fileIds.length;
  const label = `${count} ${count === 1 ? "file" : "files"}`;
  return (
    <Modal
      opened={count > 0}
      title={`Remove ${label}?`}
      onClose={isLocked ? () => {} : onClose}
      closeOnEscape={!isLocked}
      closeOnClickOutside={!isLocked}
      withCloseButton={!isLocked}
    >
      <UploadRemovalModalBody
        label={label}
        isLocked={isLocked}
        problem={form.problem}
        hasUnconfirmedRemoval={Boolean(snapshot.hasUnconfirmedRemoval)}
        isSaving={form.isSaving}
        onClose={onClose}
        onConfirm={() => {
          void form.onConfirm();
        }}
      />
    </Modal>
  );
}
