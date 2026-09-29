import { Stack, TextInput } from "@mantine/core";
import { IconMail } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { MeDto, UpdateMeRequest } from "@memory-shoebox/shared";
import { NameField } from "@/surfaces/Account/NameField";
import { Banner } from "@/system/Chrome/Banner";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
import { ICON_PROPS } from "@/system/icons";
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
 * The name field's own local state and save logic live in `NameField`; this
 * sheet is the two sections around it.
 */
export function YouSheet({
  me,
  onSave,
  isSaving,
  savedAt,
  error,
}: Readonly<Props>): ReactNode {
  return (
    <Sheet wide label="You">
      <SheetHead title="You" />
      <Stack gap="md">
        <NameField
          me={me}
          onSave={onSave}
          isSaving={isSaving}
          savedAt={savedAt}
          error={error}
        />
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
