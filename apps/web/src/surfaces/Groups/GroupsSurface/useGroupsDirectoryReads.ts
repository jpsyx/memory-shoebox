import type {
  ListGroupsResponse,
  ListMembersResponse,
  AdminMemberDto,
} from "@memory-shoebox/shared";
import {
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { adminGroupsQueryOptions } from "@/api/adminGroups/adminGroups";
import { adminMembersQueryOptions } from "@/api/inviteMember";
import { requireGroupAuthority } from "@/surfaces/Groups/groupAuthority";
import { useMemberReadAuthority } from "@/surfaces/Members/useRefreshMemberAuthority";
/** Privileged group and membership reads reconcile stale administrative authority. */
export function useGroupsDirectoryReads(): GroupsDirectoryReads {
  const queryClient = useQueryClient();
  const groups = useQuery({
    ...adminGroupsQueryOptions,
    queryFn: (context) => {
      requireGroupAuthority(queryClient);
      return adminGroupsQueryOptions.queryFn!(context);
    },
  });
  const directory = useQuery({
    ...adminMembersQueryOptions,
    queryFn: (context) => {
      requireGroupAuthority(queryClient);
      return adminMembersQueryOptions.queryFn!(context);
    },
  });
  useMemberReadAuthority(groups.error);
  useMemberReadAuthority(directory.error);
  const members =
    directory.data?.shape === "admin" ? directory.data.members : [];
  const canEdit =
    groups.isSuccess && directory.isSuccess && directory.data.shape === "admin";
  return { groups, directory, members, canEdit };
}
/** Read state shared by the Groups directory's focused modules. */
export type GroupsDirectoryReads = {
  groups: UseQueryResult<
    Extract<ListGroupsResponse, { shape: "admin" }>,
    Error
  >;
  directory: UseQueryResult<ListMembersResponse, Error>;
  members: AdminMemberDto[];
  canEdit: boolean;
};
