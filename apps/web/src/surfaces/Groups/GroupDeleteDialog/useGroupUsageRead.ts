import type { GroupUsageResponse } from "@memory-shoebox/shared";
import {
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useGroupContinuationGate } from "@/surfaces/Groups/useGroupContinuationGate";
import { groupUsageQueryOptions } from "@/api/adminGroups/adminGroups";
import { requireGroupAuthority } from "@/surfaces/Groups/groupAuthority";
import { useMemberReadAuthority } from "@/surfaces/Members/useRefreshMemberAuthority";
/** Every privileged usage read checks current authority and preserves read failures. */
export function useGroupUsageRead(
  groupId: string,
): UseQueryResult<GroupUsageResponse, Error> {
  const queryClient = useQueryClient();
  const options = groupUsageQueryOptions(groupId);
  const isBlocked = useGroupContinuationGate();
  const read = useQuery({
    ...options,
    queryFn: (context) => {
      requireGroupAuthority(queryClient);
      return options.queryFn!(context);
    },
    retry: false,
    enabled: !isBlocked,
  });
  useMemberReadAuthority(read.error);
  return read;
}
