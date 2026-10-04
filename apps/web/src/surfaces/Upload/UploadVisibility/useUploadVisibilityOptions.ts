import { groupsQueryOptions } from "@/api/groups/groups";
import { membersQueryOptions } from "@/api/members/members";
import { makePickerOptionsFromSources } from "@/surfaces/Item/WhoCanSee/visibilityChoiceHelpers/visibilityChoiceHelpers";
import type { MemberRef, VisibilitySummary } from "@memory-shoebox/shared";
import { useQuery } from "@tanstack/react-query";

/**
 * Lazy member-scoped directories, with existing saved-subject normalization.
 */
export function useUploadVisibilityOptions({
  viewer,
  saved,
  isEnabled,
}: Readonly<{
  viewer: MemberRef;
  saved: VisibilitySummary;
  isEnabled: boolean;
}>): import("@/surfaces/Item/WhoCanSee/visibilityChoiceHelpers/visibilityChoiceHelpers").PickerOptions & {
  isUnavailable: boolean;
  onRetry: () => void;
} {
  const members = useQuery({
    ...membersQueryOptions(),
    queryKey: ["members", "upload", viewer.memberId],
    enabled: isEnabled,
    retry: false,
  });
  const groups = useQuery({
    ...groupsQueryOptions(),
    queryKey: ["groups", "upload", viewer.memberId],
    enabled: isEnabled,
    retry: false,
  });
  const options = makePickerOptionsFromSources({
    members: members.data,
    groups: groups.data,
    visibility: saved,
    viewer,
  });
  return {
    ...options,
    isUnavailable: isEnabled && (members.isError || groups.isError),
    onRetry: () => {
      void members.refetch();
      void groups.refetch();
    },
  };
}
