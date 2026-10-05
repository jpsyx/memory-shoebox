import type {
  ShellSettings,
  AdminMemberDto,
  ListMembersResponse,
} from "@memory-shoebox/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { adminMembersQueryOptions } from "@/api/inviteMember";
import { useMemberReadAuthority } from "@/surfaces/Members/useRefreshMemberAuthority";
import { useMemberSelection } from "./useMemberSelection";
import { useMembersInvitation } from "./useMembersInvitation";
/** Read authority and keep invitation and dialog state owned by the directory. */
export function useMemberDirectoryState(): {
  settings: ShellSettings;
  directory: UseQueryResult<ListMembersResponse, Error>;
  invitation: ReturnType<typeof useMembersInvitation>;
  selection: ReturnType<typeof useMemberSelection>;
  members: AdminMemberDto[];
} {
  const { settings } = useRouteContext({ from: "/_app" });
  const directory = useQuery({ ...adminMembersQueryOptions, retry: false });
  useMemberReadAuthority(directory.error);
  const invitation = useMembersInvitation();
  const selection = useMemberSelection();
  const members =
    directory.data?.shape === "admin" ? directory.data.members : [];
  return { settings, directory, invitation, selection, members };
}
