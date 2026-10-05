import { meQueryOptions } from "@/api/me/me";
import { Lede } from "@/system/typography/Lede";
import { Stack, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { SetupLayout } from "../SetupLayout/SetupLayout";
import { SetupInvitationActions } from "./SetupInvitationActions/SetupInvitationActions";
import { SetupInvitationRow } from "./SetupInvitationRow/SetupInvitationRow";
import { SetupMailDiagnosis } from "./SetupMailDiagnosis/SetupMailDiagnosis";
import { useSetupInvitations } from "./useSetupInvitations/useSetupInvitations";

/** A narrow optional invitation step, completing before the existing home. */
export function SetupInvitations(): ReactNode {
  const { data: account } = useQuery(meQueryOptions);
  const form = useSetupInvitations();
  return (
    <SetupLayout shoeboxName={account?.settings.shoeboxName ?? "Shoebox"}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          form.onSubmit();
        }}
      >
        <Stack gap="lg">
          <Lede>Invite your people.</Lede>
          <Text>
            Your Shoebox is ready. Invite someone to look through it, or skip
            and put your first photos up.
          </Text>
          <SetupMailDiagnosis />
          {form.rows.map((row, index) => {
            return (
              <SetupInvitationRow
                key={row.id}
                row={row}
                index={index}
                isBusy={form.isBusy}
                onChange={form.onChange}
              />
            );
          })}
          <SetupInvitationActions form={form} />
        </Stack>
      </form>
    </SetupLayout>
  );
}
