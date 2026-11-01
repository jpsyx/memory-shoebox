import { profileNameError } from "@/surfaces/ProfileCompletion/profileNameCopy";
import { Prose } from "@/system/typography/Prose";
import { Button, TextInput } from "@mantine/core";
import type { MeDto, UpdateMeRequest } from "@memory-shoebox/shared";
import { useEffect, useRef, useState, type ReactNode } from "react";

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
 * their own. `member.displayName` is the public name or Member. The field's
 * value starts from the stored name and its placeholder is the public label.
 */
function useNameField(props: Readonly<Props>) {
  const [value, setValue] = useState(props.me.storedDisplayName ?? "");
  const input = useRef<HTMLInputElement>(null);
  const [validationError, setValidationError] = useState<string>();
  useEffect(() => {
    if (props.error) {
      input.current?.focus();
    }
  }, [props.error]);
  const trimmed = value.trim();
  const storedValue = props.me.storedDisplayName ?? "";
  const hasChanged = trimmed !== storedValue;

  const onSubmit = () => {
    const invalid = profileNameError(value);
    setValidationError(invalid);
    if (invalid) {
      input.current?.focus();
      return;
    }
    props.onSave({ displayName: trimmed });
  };

  return { value, setValue, input, validationError, hasChanged, onSubmit };
}

/**
 * The member's editable claimed name with inline validation and save status.
 */
export function NameField(props: Readonly<Props>): ReactNode {
  const { value, setValue, input, validationError, hasChanged, onSubmit } =
    useNameField(props);
  const { me, isSaving, savedAt, error } = props;
  return (
    <>
      <TextInput
        ref={input}
        error={validationError ?? error}
        label="Your name"
        description="What the family sees on your comments and on anything you put up."
        placeholder={me.member.displayName}
        value={value}
        onChange={(event) => {
          setValue(event.currentTarget.value);
        }}
      />
      <Button
        variant="default"
        size="sm"
        disabled={!hasChanged || isSaving}
        onClick={onSubmit}
      >
        Save your name
      </Button>
      {savedAt === undefined || hasChanged ? null : (
        <Prose role="status">Name saved.</Prose>
      )}
    </>
  );
}
