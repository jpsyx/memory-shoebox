import { SetupInvitationFields } from "./SetupInvitationFields";
import { NativeSelect, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import type { InvitationRow } from "./setupInvitationHelpers";
import classes from "./Setup.module.css";

type Props = {
  row: InvitationRow;
  index: number;
  isBusy: boolean;
  onChange: (id: number, updates: Partial<InvitationRow>) => void;
};
/** A local draft remains editable on failure, while queued rows stay intact. */
export function SetupInvitationRow({
  row,
  index,
  isBusy,
  onChange,
}: Readonly<Props>): ReactNode {
  if (row.isQueued) {
    return (
      <Text role="status" className={classes.person}>
        Invitation queued for {row.email}.
      </Text>
    );
  }
  return (
    <Stack className={classes.person}>
      <SetupInvitationFields
        row={row}
        index={index}
        isBusy={isBusy}
        onChange={onChange}
      />
      <NativeSelect
        label={`Role ${index + 1}`}
        value={row.role}
        disabled={isBusy}
        data={[
          { value: "viewer", label: "Viewer" },
          { value: "uploader", label: "Uploader" },
          { value: "admin", label: "Administrator" },
        ]}
        onChange={(event) => {
          return onChange(row.id, {
            role: event.currentTarget.value as InvitationRow["role"],
          });
        }}
      />
      {row.error === undefined ? null : (
        <Text role="alert" className={classes.error}>
          {row.error}
        </Text>
      )}
    </Stack>
  );
}
