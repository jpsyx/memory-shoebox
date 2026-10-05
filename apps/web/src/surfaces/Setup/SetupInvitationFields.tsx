import { Stack, TextInput } from "@mantine/core";
import type { ReactNode } from "react";
import type { InvitationRow } from "./setupInvitationHelpers";

type Props = {
  row: InvitationRow;
  index: number;
  isBusy: boolean;
  onChange: (id: number, updates: Partial<InvitationRow>) => void;
};
/** Email and optional display name for one intended invitation. */
export function SetupInvitationFields({
  row,
  index,
  isBusy,
  onChange,
}: Readonly<Props>): ReactNode {
  return (
    <Stack>
      <TextInput
        label={`Email ${index + 1}`}
        name={`email-${row.id}`}
        type="email"
        value={row.email}
        disabled={isBusy}
        onChange={(event) => {
          return onChange(row.id, { email: event.currentTarget.value });
        }}
      />
      <TextInput
        label={`Name ${index + 1} (optional)`}
        value={row.displayName}
        disabled={isBusy}
        onChange={(event) => {
          return onChange(row.id, { displayName: event.currentTarget.value });
        }}
      />
    </Stack>
  );
}
