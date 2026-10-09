import { Button, Group, Modal, Stack, TextInput } from "@mantine/core";
import { useState, type FormEvent, type ReactNode } from "react";
import { LIMITS, type PersonRef } from "@memory-shoebox/shared";
import { Prose } from "@/system/typography/Prose";

type Props = {
  person: PersonRef;
  isSaving: boolean;
  error?: string;
  onSave: (name: string) => void;
  onClose: () => void;
};

/** Renames the shared person while keeping focus and errors in the modal. */
export function RenamePersonModal({
  person,
  isSaving,
  error,
  onSave,
  onClose,
}: Readonly<Props>): ReactNode {
  const [name, setName] = useState(person.displayName);
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() && !isSaving) {
      onSave(name.trim());
    }
  };
  const close = isSaving ? () => {} : onClose;
  return (
    <Modal
      opened
      title={`Rename ${person.displayName}`}
      onClose={close}
      closeOnEscape={!isSaving}
      withCloseButton={!isSaving}
    >
      <form onSubmit={onSubmit}>
        <Stack>
          <TextInput
            label="Name"
            value={name}
            maxLength={LIMITS.memberDisplayNameMaxLength}
            required
            data-autofocus
            disabled={isSaving}
            onChange={(event) => {
              setName(event.currentTarget.value);
            }}
          />
          <Prose>This changes the name everywhere this person is tagged.</Prose>
          {error ? <Prose role="alert">{error}</Prose> : null}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" loading={isSaving} disabled={!name.trim()}>
              Save name
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
