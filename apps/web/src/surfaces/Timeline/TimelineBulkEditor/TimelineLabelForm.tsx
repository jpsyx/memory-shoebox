import { Button, Group, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { UploadTagField } from "@/surfaces/Upload/UploadLabelModal/UploadTagField";
import { UploadPersonField } from "@/surfaces/Upload/UploadLabelModal/UploadPersonField/UploadPersonField";
import type { TimelineBulkFormProps } from "./TimelineBulkDialog";
import { useTimelineLabelForm } from "./useTimelineLabelForm";

type Props = TimelineBulkFormProps & { kind: "tag" | "person" };

/** Reuses the upload fields, including explicit choices for duplicate names. */
export function TimelineLabelForm(props: Readonly<Props>): ReactNode {
  const { form, tags, people, directory, problem, onSubmit } =
    useTimelineLabelForm(props);
  return (
    <Stack gap="md">
      <Text>
        Added to every ticked photo and video. Existing tags and people will
        stay.
      </Text>
      <LabelDirectoryState directory={directory} kind={props.kind} />
      {props.kind === "tag" ? (
        <UploadTagField options={{ form, tags, isLocked: props.isBlocked }} />
      ) : (
        <UploadPersonField
          options={{ form, people, isLocked: props.isBlocked }}
        />
      )}
      {problem ? <Text role="alert">{problem}</Text> : null}
      <LabelActions
        props={props}
        canSubmit={form.names.length > 0 && directory.isSuccess}
        onSubmit={onSubmit}
      />
    </Stack>
  );
}

function LabelDirectoryState({
  directory,
  kind,
}: Readonly<{
  directory: ReturnType<typeof useTimelineLabelForm>["directory"];
  kind: Props["kind"];
}>): ReactNode {
  return (
    <>
      {directory.isPending ? (
        <Text>Loading {kind === "tag" ? "tags" : "people"}…</Text>
      ) : null}
      {directory.isError ? (
        <div role="alert">
          <Text>
            The directory could not be loaded. Retry to choose an existing name.
          </Text>
          <Button
            variant="default"
            onClick={() => {
              void directory.refetch();
            }}
          >
            Retry list
          </Button>
        </div>
      ) : null}
    </>
  );
}

function LabelActions({
  props,
  canSubmit,
  onSubmit,
}: Readonly<{
  props: Props;
  canSubmit: boolean;
  onSubmit: () => void;
}>): ReactNode {
  return (
    <Group>
      <Button
        disabled={props.isBlocked || !canSubmit}
        loading={props.isBusy}
        onClick={onSubmit}
      >
        Tag all {props.itemIds.length}
      </Button>
      <Button variant="default" disabled={props.isBusy} onClick={props.onClose}>
        Cancel
      </Button>
    </Group>
  );
}
