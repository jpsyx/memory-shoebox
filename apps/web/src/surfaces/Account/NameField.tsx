import { Button, TextInput } from "@mantine/core";
import { useState, type ReactNode } from "react";
import type { MeDto, UpdateMeRequest } from "@memory-shoebox/shared";
import { Prose } from "@/system/typography/Prose";

/**
 * Props for the name field: the member's own record, the save callback, and
 * the three states the parent can be in mid-save, just saved, or refused.
 */
type Props = {
  me: MeDto;
  onSave: (body: UpdateMeRequest) => void;
  isSaving: boolean;
  /** `Date.now()` of the last successful save, or undefined before one. */
  savedAt: number | undefined;
  error: string | undefined;
};

/**
 * The one field a member can correct: its own local edit state, and the
 * button that commits it. Lifted out of `YouSheet` so the sheet reads as its
 * sections (the name, the address) rather than as this field's state.
 *
 * `storedDisplayName` is the raw column, null until somebody types a name of
 * their own. `member.displayName` is resolved, falling back to the email's
 * local part. The field's value starts from the first and its placeholder is
 * the second, so the fallback shows as a hint rather than as text the member
 * appears to have typed.
 */
export function NameField({
  me,
  onSave,
  isSaving,
  savedAt,
  error,
}: Readonly<Props>): ReactNode {
  const [value, setValue] = useState(me.storedDisplayName ?? "");
  const trimmed = value.trim();
  const storedValue = me.storedDisplayName ?? "";
  const hasChanged = trimmed !== storedValue;

  const onSubmit = () => {
    onSave({ displayName: trimmed === "" ? null : trimmed });
  };

  return (
    <>
      <TextInput
        label="Your name"
        description="What the family sees on your comments and on anything you put up."
        placeholder={me.member.displayName}
        value={value}
        onChange={(event) => {
          setValue(event.currentTarget.value);
        }}
      />
      {error === undefined ? null : <Prose role="alert">{error}</Prose>}
      <Prose>
        Whoever invited you typed this in. If they got it wrong, or if you would
        rather be something else here, change it.
      </Prose>
      <Button
        variant="default"
        size="sm"
        disabled={!hasChanged || isSaving}
        onClick={onSubmit}
      >
        Save your name
      </Button>
      {savedAt === undefined || hasChanged ? null : <Prose>Saved.</Prose>}
    </>
  );
}
