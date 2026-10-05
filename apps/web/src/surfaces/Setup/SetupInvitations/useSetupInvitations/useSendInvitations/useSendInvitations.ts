import { adminMembersQueryOptions } from "@/api/inviteMember";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import type { SetupInvitationDrafts } from "../../../setupFlow.types";
import type { InvitationRow } from "../../../setupInvitationHelpers";
import { sendSetupInvitation } from "./sendSetupInvitation";

/** Queues unfinished invitations and refreshes member query results. */
export function useSendInvitations(
  onQueued: SetupInvitationDrafts["onQueued"],
): { isPending: boolean; send: (rows: readonly InvitationRow[]) => void } {
  const client = useQueryClient();
  const isSending = useRef(false);
  const mutation = useMutation({
    mutationFn: (rows: readonly InvitationRow[]) => {
      return Promise.all(
        rows.map((row) => {
          return sendSetupInvitation({ row, client });
        }),
      );
    },
    onSuccess: async (rows) => {
      await client.invalidateQueries({
        queryKey: adminMembersQueryOptions.queryKey,
      });
      await client.invalidateQueries({ queryKey: ["members", "picker"] });
      onQueued(rows);
    },
    onSettled: () => {
      isSending.current = false;
    },
  });
  return {
    isPending: mutation.isPending,
    send: (rows) => {
      if (!isSending.current) {
        isSending.current = true;
        mutation.mutate(rows);
      }
    },
  };
}
