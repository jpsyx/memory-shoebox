import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import {
  inviteMemberRequestSchema,
  type InviteMemberRequest,
  type ListMembersResponse,
  type MeResponse,
} from "@memory-shoebox/shared";

/** One local invitation draft, preserving successfully queued identities. */
export type InvitationRow = {
  id: number;
  email: string;
  displayName: string;
  role: InviteMemberRequest["role"];
  isQueued: boolean;
  error?: string;
  errorField?: "email" | "displayName";
  isUncertain?: boolean;
};
/** A blank viewer draft, with identity stable across updates and sends. */
export function makeInvitationRowFromId(id: number): InvitationRow {
  return { id, email: "", displayName: "", role: "viewer", isQueued: false };
}
/** Returns normalized invitation data or row validation issues. */
export function makeInvitationRequestValidationFromRow(
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
    account: MeResponse | undefined;
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
  const status = error instanceof ApiRequestError ? error.status : undefined;
  return status === 409
    ? "This person already has an account. Check the address or skip for now."
    : status === 429
      ? "Too many invitations just now. Wait a little, then retry."
      : "Could not confirm this invitation. Check your connection, then retry or skip for now.";
}
