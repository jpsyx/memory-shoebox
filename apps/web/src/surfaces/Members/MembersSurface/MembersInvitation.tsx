import type { ReactNode } from "react";
import type { MembersInvitationState } from "@/surfaces/Members/MembersSurface/useMembersInvitation";
import { InviteMemberForm } from "@/surfaces/Members/InviteMemberForm/InviteMemberForm";
import { Banner } from "@/system/Chrome/Banner";

type Props = { invitation: MembersInvitationState };
/** An invitation draft remains inline; queued delivery is reported accurately. */
export function MembersInvitation({ invitation }: Readonly<Props>): ReactNode {
  return (
    <>
      {invitation.sentEmail === undefined ? null : (
        <div role="status">
          <Banner>
            Invitation queued for {invitation.sentEmail}. It expires in seven
            days. They appear below until they sign in.
          </Banner>
        </div>
      )}
      {invitation.isInviting ? (
        <InviteMemberForm
          onClose={invitation.onClose}
          onSent={invitation.onSent}
        />
      ) : null}
    </>
  );
}
