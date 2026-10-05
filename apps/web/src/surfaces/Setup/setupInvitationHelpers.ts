import {
  inviteMemberRequestSchema,
  type InviteMemberRequest,
  type ListMembersResponse,
  type MeResponse,
} from "@memory-shoebox/shared";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";

/** One local invitation draft, preserving successfully queued identities. */
export type InvitationRow = {
  id: number;
  email: string;
  displayName: string;
  role: InviteMemberRequest["role"];
  isQueued: boolean;
  error?: string;
  isUncertain?: boolean;
};
/** A blank viewer draft, with identity stable across updates and sends. */
export function makeInvitationRowFromId(id: number): InvitationRow {
  return { id, email: "", displayName: "", role: "viewer", isQueued: false };
}
/** Shared invitation validation happens before any intended row is sent. */
export function getInvitationRequestFromRow(
  row: Readonly<InvitationRow>,
): ReturnType<typeof inviteMemberRequestSchema.safeParse> {
  return inviteMemberRequestSchema.safeParse({
    email: row.email,
    displayName: row.displayName.trim() || null,
    role: row.role,
  });
}
/** A lost response recovers only this admin's matching pending invitation. */
export function hasMatchingInvitation(
  options: Readonly<{
    directory: ListMembersResponse;
    body: InviteMemberRequest;
    account: MeResponse | null | undefined;
  }>,
): boolean {
  const { directory, body, account } = options;
  return (
    directory.shape === "admin" &&
    directory.members.some((member) => {
      return (
        member.email === body.email &&
        member.role === body.role &&
        member.status === "invited" &&
        member.invitation?.isPending === true &&
        member.invitation.invitedBy.memberId === account?.me.member.memberId &&
        (body.displayName == null || member.displayName === body.displayName)
      );
    })
  );
}
/** Errors name a recovery without suggesting an invitation was delivered. */
export function invitationFailure(error: unknown): string {
  if (error instanceof ApiRequestError && error.status === 409) {
    return "This person already has an account. Check the address or skip for now.";
  }
  if (error instanceof ApiRequestError && error.status === 429) {
    return "Too many invitations just now. Wait a little, then retry.";
  }
  return "Could not confirm this invitation. Check your connection, then retry or skip for now.";
}
