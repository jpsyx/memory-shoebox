import { useQuery } from "@tanstack/react-query";
import type { MemberRef, VisibilitySummary } from "@memory-shoebox/shared";
import { membersQueryOptions } from "@/api/members/members";
import { groupsQueryOptions } from "@/api/groups/groups";
import { makePickerOptionsFromSources } from "@/surfaces/Item/WhoCanSee/visibilityChoiceHelpers/visibilityChoiceHelpers";
type Options = {
  viewer: MemberRef;
  saved: VisibilitySummary;
  isEnabled: boolean;
};
/** Lazy member-scoped directories, with existing saved-subject normalization. */
export function useUploadVisibilityOptions({
  viewer,
  saved,
  isEnabled,
}: Readonly<Options>): import("@/surfaces/Item/WhoCanSee/visibilityChoiceHelpers/visibilityChoiceHelpers").PickerOptions & {
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
    onRetry: (): void => {
      void members.refetch();
      void groups.refetch();
    },
  };
}
