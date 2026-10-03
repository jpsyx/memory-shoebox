import { useQuery } from "@tanstack/react-query";
import type { MemberRef, VisibilitySummary } from "@memory-shoebox/shared";
import { groupsQueryOptions } from "@/api/groups/groups";
import { membersQueryOptions } from "@/api/members/members";
import {
  makePickerOptionsFromSources,
  type PickerOptions,
} from "@/surfaces/Item/WhoCanSee/visibilityChoiceHelpers/visibilityChoiceHelpers";

/**
 * What the visibility picker offers, with the member and group lists fetched
 * by whoever calls this. The editor is the only caller, so the lists are
 * asked for only once it opens, the one place they are needed.
 */
export function usePickerOptions(
  options: Readonly<{ visibility: VisibilitySummary; viewer: MemberRef }>,
): PickerOptions {
  const members = useQuery(membersQueryOptions());
  const groups = useQuery(groupsQueryOptions());
  return makePickerOptionsFromSources({
    members: members.data,
    groups: groups.data,
    visibility: options.visibility,
    viewer: options.viewer,
  });
}
