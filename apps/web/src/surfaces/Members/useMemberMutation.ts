import type {
  AdminMemberDto,
  InviteMemberRequest,
  MemberRole,
  SessionDto,
} from "@memory-shoebox/shared";
import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import {
  changeMemberRole,
  inviteAdminMember,
  removeMember,
  resendMemberInvitation,
  revokeMemberInvitation,
  revokeMemberSession,
} from "@/api/adminMembers/adminMembers";
import { meQueryOptions } from "@/api/me/me";
import { useMemberSaved } from "@/surfaces/Members/useMemberSaved";
import { useRefreshMemberAuthority } from "@/surfaces/Members/useRefreshMemberAuthority";

/** A confirmed administrative action, with its original consent facts. */
export type MemberAction =
  | { kind: "invite"; body: InviteMemberRequest }
  | { kind: "role"; member: AdminMemberDto; role: MemberRole }
  | { kind: "remove" | "resend" | "revoke"; member: AdminMemberDto }
  | { kind: "device"; member: AdminMemberDto; session: SessionDto };

async function _performAction(
  action: Readonly<MemberAction>,
): Promise<AdminMemberDto | void> {
  switch (action.kind) {
    case "invite":
      return inviteAdminMember(action.body);
    case "role":
      return changeMemberRole({
        memberId: action.member.memberId,
        role: action.role,
      });
    case "remove":
      return removeMember(action.member.memberId);
    case "resend":
      return resendMemberInvitation(action.member.memberId);
    case "revoke":
      return revokeMemberInvitation(action.member.memberId);
    case "device":
      return revokeMemberSession({
        memberId: action.member.memberId,
        sessionId: action.session.sessionId,
      });
  }
}

/** Member writes refresh all authority-dependent data and the router's guard. */
export function useMemberMutation(
  options: Readonly<{
    onSaved: (action: MemberAction) => void;
    onFailed?: (error: Error) => void;
  }>,
): UseMutationResult<AdminMemberDto | void, Error, MemberAction> {
  const queryClient = useQueryClient();
  const refreshAuthority = useRefreshMemberAuthority();
  const onSuccess = useMemberSaved(options.onSaved);
  return useMutation({
    scope: { id: "me" },
    mutationFn: (action: MemberAction) => {
      if (
        queryClient.getQueryData(meQueryOptions.queryKey)?.me.role !== "admin"
      ) {
        throw new ApiRequestError({
          status: 403,
          code: "members_forbidden",
          message: "Admin required",
        });
      }
      return _performAction(action);
    },
    onSuccess,
    onError: async (error) => {
      options.onFailed?.(error);
      await queryClient.invalidateQueries({ queryKey: ["members"] });
      if (
        error instanceof ApiRequestError &&
        (error.status === 401 || error.status === 403)
      ) {
        await refreshAuthority();
      }
    },
  });
}
