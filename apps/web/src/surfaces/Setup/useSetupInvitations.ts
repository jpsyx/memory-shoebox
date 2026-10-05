import type { SetupInvitationsFlow } from "./setupFlow.types";
import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { adminMembersQueryOptions } from "@/api/adminMembers/adminMembers";
import { completeSetup, setupProgressQueryOptions } from "@/api/setup/setup";
import { sendSetupInvitation } from "./sendSetupInvitation";
import { useSetupInvitationDrafts } from "./useSetupInvitationDrafts";
import type { InvitationRow } from "./setupInvitationHelpers";

function useCompleteInvitations() {
  const client = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: completeSetup,
    onSuccess: async () => {
      client.setQueryData(setupProgressQueryOptions.queryKey, {
        needsInvitations: false,
      });
      await client.invalidateQueries({
        queryKey: setupProgressQueryOptions.queryKey,
      });
      await navigate({ to: "/", replace: true });
    },
  });
}
function useSendInvitations(onQueued: (rows: InvitationRow[]) => void) {
  const client = useQueryClient();
  const isSending = useRef(false);
  const mutation = useMutation({
    mutationFn: (rows: InvitationRow[]) => {
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
    send: (rows: InvitationRow[]) => {
      if (!isSending.current) {
        isSending.current = true;
        mutation.mutate(rows);
      }
    },
  };
}
/** Queues only unfinished drafts and permits explicit completion despite errors. */
export function useSetupInvitations(): SetupInvitationsFlow {
  const draft = useSetupInvitationDrafts();
  const completion = useCompleteInvitations();
  const sending = useSendInvitations((queuedRows) => {
    draft.onQueued(queuedRows);
    if (
      queuedRows.every((row) => {
        return row.isQueued;
      })
    ) {
      completion.mutate();
    }
  });
  const isBusy = sending.isPending || completion.isPending;
  const onSubmit = () => {
    if (isBusy) {
      return;
    }
    const validated = draft.getValidatedRows();
    if (validated !== undefined) {
      sending.send(validated);
    }
  };
  return {
    rows: draft.rows,
    onAdd: draft.onAdd,
    onChange: draft.onChange,
    isBusy,
    onSubmit,
    onSkip: () => {
      if (!isBusy) {
        completion.mutate();
      }
    },
    completionError: completion.isError
      ? "Could not finish setup. Try again or skip for now."
      : undefined,
  };
}
