import { Button, Modal, Stack, TagsInput } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  tagsQueryOptions,
  peopleQueryOptions,
} from "@/api/vocabularies/vocabularies";
import { PeopleField } from "@/system/PeopleField/PeopleField";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Prose } from "@/system/typography/Prose";
import type {
  UploadSessionController,
  UploadSnapshot,
} from "@/upload/uploadSessionController/uploadSessionController.types";
import { useUploadLabelForm } from "./useUploadLabelForm";
import { UploadPersonChoice } from "./UploadPersonChoice";
import classes from "../upload.module.css";
import components from "@/theme/components.module.css";
type Props = {
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
function _tagField(
  options: Readonly<{ form: Form; tags: Tags; isLocked: boolean }>,
): ReactNode {
  const { form, tags, isLocked } = options;
  return (
    <TagsInput
      label="Tags"
      description="Start typing. Pick one you have used before, or press Enter to make a new one."
      placeholder="hospital, first steps"
      autoFocus
      value={form.names}
      onChange={form.onNamesChange}
      disabled={isLocked}
      data={(tags.data?.tags ?? []).map((entry) => {
        return entry.tag.name;
      })}
      splitChars={[","]}
      renderOption={({ option }) => {
        const entry = tags.data?.tags.find((tag) => {
          return tag.tag.name === option.value;
        });
        return (
          <>
            {option.value}
            <span className={components.comboOptionCount}>
              {entry?.itemCount.toLocaleString("en-GB") ?? "new"}
            </span>
          </>
        );
      }}
    />
  );
}
function _personField(
  options: Readonly<{ form: Form; people: People; isLocked: boolean }>,
): ReactNode {
  const { form, people, isLocked } = options;
  return (
    <fieldset disabled={isLocked} className={classes.fields}>
      <PeopleField
        label="Who is in them"
        description="Start typing. Pick a name from the list, or press Enter on one the archive has never heard of to add it."
        placeholder="Mateo, Abuela Rosa, a great-grandmother"
        autoFocus
        mode="anyone"
        members={[]}
        people={(people.data?.people ?? []).map((entry) => {
          return { ...entry.person, itemCount: entry.itemCount };
        })}
        value={form.names}
        onChange={form.onNamesChange}
      />
      <UploadPersonChoice
        names={form.names}
        people={people.data?.people ?? []}
        choices={form.personIds}
        onChoose={form.onPersonChoice}
        isDisabled={isLocked}
      />
    </fieldset>
  );
}
function _directoryStatus(
  options: Readonly<{ directory: Tags | People; kind: Props["kind"] }>,
): ReactNode {
  const { directory, kind } = options;
  const word = kind === "tag" ? "tags" : "people";
  return directory.isPending ? (
    <Prose>Loading {word}…</Prose>
  ) : directory.isError ? (
    <div role="alert">
      <Prose>
        {kind === "tag" ? "Tags" : "People"} are unavailable. Typed names can
        still be added as new labels; retry to choose an existing one.
      </Prose>
      <Button
        variant="default"
        onClick={() => {
          void directory.refetch();
        }}
      >
        Retry {word}
      </Button>
    </div>
  ) : null;
}
type ModalBodyOptions = {
  props: Props;
  form: Form;
  tags: Tags;
  people: People;
};
function _modalBody(options: Readonly<ModalBodyOptions>): ReactNode {
  const { props, form, tags, people } = options;
  const directory = props.kind === "tag" ? tags : people;
  const isLocked = form.isSaving || props.snapshot.isBusy;
  const count = props.snapshot.selectedFileIds.size;
  return (
    <Stack gap="md">
      {_directoryStatus({ directory, kind: props.kind })}
      {props.kind === "tag"
        ? _tagField({ form, tags, isLocked })
        : _personField({ form, people, isLocked })}
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
/** Optional persisted tag/person editing, with honest directory failure states. */
export function UploadLabelModal({
  kind,
  opened,
  controller,
  snapshot,
  onClose,
}: Readonly<Props>): ReactNode {
  const tags = useQuery({
    ...tagsQueryOptions(undefined),
    enabled: opened && kind === "tag",
  });
  const people = useQuery({
    ...peopleQueryOptions(undefined),
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
  const count = snapshot.selectedFileIds.size;
  return (
    <Modal
      opened={opened}
      onClose={isLocked ? () => {} : onClose}
      closeOnEscape={!isLocked}
      closeOnClickOutside={!isLocked}
      withCloseButton={!isLocked}
      title={
        kind === "tag" ? `Tag ${count} at once` : `Who is in these ${count}?`
      }
      size="lg"
    >
      {_modalBody({
        props: { kind, opened, controller, snapshot, onClose },
        form,
        tags,
        people,
      })}
    </Modal>
  );
}
