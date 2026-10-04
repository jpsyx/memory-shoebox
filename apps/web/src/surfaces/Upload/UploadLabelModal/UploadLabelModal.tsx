import {
  peopleQueryOptions,
  tagsQueryOptions,
} from "@/api/vocabularies/vocabularies";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { Modal } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { UploadLabelModalBody } from "./UploadLabelModalBody";
import { useUploadLabelForm } from "./useUploadLabelForm";
type Props = {
  memberId: string;
  kind: "tag" | "person";
  opened: boolean;
  controller: UploadSessionController;
  snapshot: UploadSnapshot;
  onClose: () => void;
};

/**
 * Optional persisted tag/person editing, with honest directory failure
 * states.
 */
export function UploadLabelModal({
  memberId,
  kind,
  opened,
  controller,
  snapshot,
  onClose,
}: Readonly<Props>): ReactNode {
  const tags = useQuery({
    ...tagsQueryOptions(undefined),
    queryKey: ["tags", "upload", memberId],
    enabled: opened && kind === "tag",
  });
  const people = useQuery({
    ...peopleQueryOptions(undefined),
    queryKey: ["people", "upload", memberId],
    enabled: opened && kind === "person",
  });
  const form = useUploadLabelForm({
    kind,
    controller,
    tags: tags.data?.tags ?? [],
    people: people.data?.people ?? [],
    onClose,
  });
  const isLocked = form.isSaving || snapshot.isBusy;
  const selectedFileCount = snapshot.selectedFileIds.size;
  const props = { memberId, kind, opened, controller, snapshot, onClose };
  return (
    <Modal
      opened={opened}
      onClose={isLocked ? () => {} : onClose}
      closeOnEscape={!isLocked}
      closeOnClickOutside={!isLocked}
      withCloseButton={!isLocked}
      title={
        kind === "tag"
          ? `Tag ${selectedFileCount} at once`
          : `Who is in these ${selectedFileCount}?`
      }
      size="lg"
    >
      <UploadLabelModalBody options={{ props, form, tags, people }} />
    </Modal>
  );
}
