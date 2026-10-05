import { useMemberContinuationGate } from "@/surfaces/Members/useMemberContinuationGate";
import { Button } from "@mantine/core";
import type { AdminMemberDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { MemberInvitationActions } from "@/surfaces/Members/MembersSurface/MemberInvitationActions";
import type { MemberAction } from "@/surfaces/Members/useMemberMutation";
import { ChipRow } from "@/system/Chip/ChipRow";
import classes from "./MemberActions.module.css";

type Props = {
  member: AdminMemberDto;
  onAction: (action: MemberAction) => void;
};
/** Named member controls and the event actor link. */
export function MemberActions({
  member,
  onAction,
}: Readonly<Props>): ReactNode {
  const isBlocked = useMemberContinuationGate().hasCommitted;
  return (
    <ChipRow>
      <Button
        disabled={isBlocked}
        variant="default"
        size="sm"
        aria-label={`Change role for ${member.displayName}`}
        onClick={() => {
          onAction({ kind: "role", member, role: member.role });
        }}
      >
        Change role
      </Button>
      {member.status === "invited" ? (
        <MemberInvitationActions member={member} onAction={onAction} />
      ) : (
        <Button
          disabled={isBlocked}
          variant="default"
          size="sm"
          aria-label={`Remove ${member.displayName}`}
          onClick={() => {
            onAction({ kind: "remove", member });
          }}
        >
          Remove
        </Button>
      )}
      <Link
        to="/changes"
        search={{ actorMemberId: member.memberId }}
        className={classes.memberActionsLink}
      >
        Changes by {member.displayName}
      </Link>
    </ChipRow>
  );
}
