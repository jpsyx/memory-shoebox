import { ChipRow } from "@/system/Chip/ChipRow";
import { Prose } from "@/system/typography/Prose";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/uploadSessionController/uploadSessionController.types";
import { Button, Stack } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { UploadLabelDirectoryStatus } from "./UploadLabelDirectoryStatus";
import { UploadPersonField } from "./UploadPersonField";
import { UploadTagField } from "./UploadTagField";
import { useUploadLabelForm } from "./useUploadLabelForm";
type ParentProps = {
  memberId: string;
  kind: "tag" | "person";
  opened: boolean;
  controller: UploadSessionController;
  snapshot: UploadSnapshot;
  onClose: () => void;
};
type Form = ReturnType<typeof useUploadLabelForm>;
type Tags = ReturnType<
  typeof useQuery<import("@memory-shoebox/shared").TagsResponse>
>;
type People = ReturnType<
  typeof useQuery<import("@memory-shoebox/shared").PeopleResponse>
>;
type ModalBodyOptions = {
  props: ParentProps;
  form: Form;
  tags: Tags;
  people: People;
};
type Props = {
  options: Readonly<ModalBodyOptions>;
};

/** Composes directory status, label input and submission controls. */
export function UploadLabelModalBody({ options }: Readonly<Props>): ReactNode {
  const { props, form, tags, people } = options;
  const directory = props.kind === "tag" ? tags : people;
  const isLocked = form.isSaving || props.snapshot.isBusy;
  const count = props.snapshot.selectedFileIds.size;
  return (
    <Stack gap="md">
      <UploadLabelDirectoryStatus options={{ directory, kind: props.kind }} />
      {props.kind === "tag" ? (
        <UploadTagField options={{ form, tags, isLocked }} />
      ) : (
        <UploadPersonField options={{ form, people, isLocked }} />
      )}
      {form.error ? (
        <div role="alert">
          <Prose>{form.error}</Prose>
        </div>
      ) : null}
      <ChipRow>
        <Button
          disabled={
            isLocked ||
            form.names.length === 0 ||
            count === 0 ||
            directory.isPending
          }
          loading={form.isSaving}
          onClick={() => {
            void form.onSubmit();
          }}
        >
          Tag all {count}
        </Button>
        <Button variant="default" disabled={isLocked} onClick={props.onClose}>
          Cancel
        </Button>
      </ChipRow>
    </Stack>
  );
}
