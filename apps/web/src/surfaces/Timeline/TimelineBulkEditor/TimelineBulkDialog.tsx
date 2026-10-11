import { Modal, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import type { BulkEditItemsRequest } from "@memory-shoebox/shared";
import { useTimelineBulkMutation } from "./useTimelineBulkMutation";
import { TimelineDeleteConfirmation } from "./TimelineDeleteConfirmation";
import { TimelineLabelForm } from "./TimelineLabelForm";
import { TimelineMilestoneForm } from "./TimelineMilestoneForm";

/** The dialog owns a frozen selection until it is cancelled or confirmed. */
export type TimelineBulkChoice = {
  kind: "tag" | "person" | "milestone" | "delete";
  itemIds: string[];
};

type Props = {
  choice: TimelineBulkChoice;
  onClose: () => void;
  onReview: () => void;
  onSaved: (body: BulkEditItemsRequest) => void;
};

function _dialogTitle(choice: Readonly<TimelineBulkChoice>): string {
  const count = choice.itemIds.length;
  return choice.kind === "delete"
    ? `Delete ${count} photos and videos?`
    : choice.kind === "tag"
      ? `Tag ${count} at once`
      : choice.kind === "person"
        ? `Who is in these ${count}?`
        : `Put ${count} under a milestone`;
}

function _renderForm(
  options: Readonly<{
    kind: TimelineBulkChoice["kind"];
    formProps: TimelineBulkFormProps;
  }>,
): ReactNode {
  return options.kind === "delete" ? (
    <TimelineDeleteConfirmation {...options.formProps} />
  ) : options.kind === "milestone" ? (
    <TimelineMilestoneForm {...options.formProps} />
  ) : (
    <TimelineLabelForm {...options.formProps} kind={options.kind} />
  );
}

/** Protected focus and error-aware review for timeline bulk operations. */
export function TimelineBulkDialog(props: Readonly<Props>): ReactNode {
  const mutation = useTimelineBulkMutation(props.onSaved);
  const onClose = () => {
    if (mutation.isPending) {
      return;
    }
    if (mutation.needsReview) {
      props.onReview();
    } else {
      props.onClose();
    }
  };
  const formProps = {
    itemIds: props.choice.itemIds,
    isBusy: mutation.isPending,
    isBlocked: mutation.isPending || mutation.needsReview,
    onSubmit: mutation.submit,
    onClose,
  };
  return (
    <Modal
      opened
      title={_dialogTitle(props.choice)}
      size={props.choice.kind === "delete" ? "md" : "lg"}
      onClose={onClose}
      closeOnEscape={!mutation.isPending}
      closeOnClickOutside={!mutation.isPending}
      withCloseButton={!mutation.isPending}
    >
      <Stack gap="lg">
        {mutation.problem ? <Text role="alert">{mutation.problem}</Text> : null}
        {_renderForm({ kind: props.choice.kind, formProps })}
      </Stack>
    </Modal>
  );
}

/** Inputs shared by the existing upload-style forms and delete confirmation. */
export type TimelineBulkFormProps = {
  itemIds: readonly string[];
  isBusy: boolean;
  isBlocked: boolean;
  onSubmit: (body: BulkEditItemsRequest) => void;
  onClose: () => void;
};
