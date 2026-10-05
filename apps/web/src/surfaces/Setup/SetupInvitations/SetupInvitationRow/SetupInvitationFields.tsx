import { Stack, TextInput } from "@mantine/core";
import type { ReactNode } from "react";
import type { SetupInvitationDrafts } from "../../setupFlow.types";
import type { InvitationRow } from "../../setupInvitationHelpers";

type Props = {
  row: InvitationRow;
  index: number;
  isBusy: boolean;
  onChange: SetupInvitationDrafts["onChange"];
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
        error={row.errorField === "email" ? row.error : undefined}
        value={row.email}
        disabled={isBusy}
        onChange={(event) => {
          return onChange({
            id: row.id,
            updates: { email: event.currentTarget.value },
          });
        }}
      />
      <TextInput
        label={`Name ${index + 1} (optional)`}
        name={`displayName-${row.id}`}
        error={row.errorField === "displayName" ? row.error : undefined}
        value={row.displayName}
        disabled={isBusy}
        onChange={(event) => {
          return onChange({
            id: row.id,
            updates: { displayName: event.currentTarget.value },
          });
        }}
      />
    </Stack>
  );
}
