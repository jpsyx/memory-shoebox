import { Button, Stack, TextInput } from "@mantine/core";
import { IconMail } from "@tabler/icons-react";
import { useState, type ReactNode } from "react";
import type { MeDto, UpdateMeRequest } from "@memory-shoebox/shared";
import { Banner } from "@/system/Chrome/Banner";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
import { ICON_PROPS } from "@/system/icons";
import { Prose } from "@/system/typography/Prose";
import classes from "@/system/system.module.css";

/**
 * Props for the You sheet: the name a member can correct, and the address
 * they cannot.
 *
 * Neither `me` nor `onSave` is fetched here: both come from the assembly
 * (Task 10), which is what keeps this sheet testable without a router or a
 * query client.
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
 * The name a member can correct, and the address they cannot.
 *
 * `storedDisplayName` is the raw column, null until somebody types a name of
 * their own. `member.displayName` is resolved, falling back to the email's
 * local part. The field's value starts from the first and its placeholder is
 * the second, so the fallback shows as a hint rather than as text the member
 * appears to have typed.
 */
export function YouSheet({
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
    <Sheet wide label="You">
      <SheetHead title="You" />
      <Stack gap="md">
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
          Whoever invited you typed this in. If they got it wrong, or if you
          would rather be something else here, change it.
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
        <TextInput
          label="Your email"
          description="Sign-in codes and every notification go here."
          value={me.email}
          readOnly
          classNames={{ input: classes.fieldFixed }}
        />
        <Banner icon={<IconMail {...ICON_PROPS} />}>
          <b>This address cannot be changed.</b> It is not a detail on an
          account, it is the account: it is what you were invited at, what the
          six-digit code goes to, and the only thing that proves you are you. To
          move to a different address an admin invites the new one and removes
          this one, which is deliberately a thing somebody else does.
        </Banner>
      </Stack>
    </Sheet>
  );
}
