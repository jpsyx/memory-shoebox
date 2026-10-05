import { Button } from "@mantine/core";
import type { AdminMemberDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { useInvitationResend } from "@/surfaces/Members/MembersSurface/useInvitationResend";
import { memberFailure } from "@/surfaces/Members/memberCopy";
import type { MemberAction } from "@/surfaces/Members/useMemberMutation";
import { ChipRow } from "@/system/Chip/ChipRow";

type Props = {
  member: AdminMemberDto;
  onAction: (action: MemberAction) => void;
};
/** Invitation actions keep their pending/error/wait lifecycle with the row. */
export function MemberInvitationActions({
  member,
  onAction,
}: Readonly<Props>): ReactNode {
  const { mutation, waitSeconds, sent, onResend } = useInvitationResend(member);
  return (
    <>
      <ChipRow>
        <Button
          variant="default"
          size="sm"
          aria-label={`Send invitation again to ${member.displayName}`}
          loading={mutation.isPending}
          disabled={waitSeconds > 0}
          onClick={onResend}
        >
          Send it again
        </Button>
        <Button
          variant="default"
          size="sm"
          aria-label={`Revoke invitation for ${member.displayName}`}
          disabled={mutation.isPending}
          onClick={() => {
            onAction({ kind: "revoke", member });
          }}
        >
          Revoke
        </Button>
      </ChipRow>
      {mutation.error === null ? null : (
        <p role="alert">{memberFailure(mutation.error)}</p>
      )}
      {sent ? (
        <p role="status">
          Invitation queued for {member.email}. Wait {waitSeconds} seconds
          before sending again.
        </p>
      ) : null}
    </>
  );
}
