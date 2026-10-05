import type { AdminMemberDto } from "@memory-shoebox/shared";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { adminMembersQueryOptions } from "@/api/inviteMember";
import { meQueryOptions } from "@/api/me/me";
import { makeDirectoryFromMemberUpdate } from "@/surfaces/Members/memberCacheHelpers";
import type { MemberAction } from "@/surfaces/Members/useMemberMutation";
import { useRefreshMemberAuthority } from "@/surfaces/Members/useRefreshMemberAuthority";

/** Reads whose data depends on a member's authority or historical actions. */
const MEMBER_DEPENDENT_KEYS = [
  "members",
  "groups",
  "timeline",
  "items",
  "bursts",
  "people",
  "presence",
  "activity",
  "observations",
  "removal-requests",
  "milestones",
  "me",
] as const;

function _applyMemberResponse(
  options: Readonly<{
    queryClient: QueryClient;
    updated: AdminMemberDto | void;
    action: MemberAction;
  }>,
): boolean {
  const { queryClient, updated, action } = options;
  const currentId = queryClient.getQueryData(meQueryOptions.queryKey)?.me.member
    .memberId;
  const losesSession =
    action.kind === "device"
      ? action.session.isCurrent && action.member.memberId === currentId
      : action.kind === "remove" && action.member.memberId === currentId;
  if (losesSession) {
    queryClient.clear();
    queryClient.setQueryData(meQueryOptions.queryKey, null);
    return true;
  }
  if (updated !== undefined) {
    queryClient.setQueryData(adminMembersQueryOptions.queryKey, (directory) => {
      return makeDirectoryFromMemberUpdate({ directory, member: updated });
    });
  }
  return false;
}

/** Applies committed writes, clears revoked sessions and refreshes route guards. */
export function useMemberSaved(
  onSaved: (action: MemberAction) => void,
): (updated: AdminMemberDto | void, action: MemberAction) => Promise<void> {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const refreshAuthority = useRefreshMemberAuthority();
  return async (updated, action) => {
    if (_applyMemberResponse({ queryClient, updated, action })) {
      onSaved(action);
      await navigate({ to: "/sign-in", replace: true });
      return;
    }
    await Promise.all(
      MEMBER_DEPENDENT_KEYS.map((key) => {
        return queryClient.invalidateQueries({ queryKey: [key] });
      }),
    );
    await refreshAuthority();
    onSaved(action);
  };
}
